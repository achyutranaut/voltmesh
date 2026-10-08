// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "../../src/AccessRegistry.sol";
import "../../src/ParticipantRegistry.sol";
import "../../src/DeviceRegistry.sol";
import "../../src/EpochOracle.sol";
import "../../src/Escrow.sol";
import "../../src/BatchSettlement.sol";
import "../../src/mocks/MockERC20.sol";

contract BatchSettlementHandler is Test {
    using MessageHashUtils for bytes32;

    BatchSettlement public settlement;
    Escrow public escrow;
    MockERC20 public token;
    AccessRegistry public access;
    ParticipantRegistry public participants;
    EpochOracle public oracle;

    address public operator = address(0x09);
    address public debtor = address(0x111);
    address public creditor = address(0x222);

    uint256 public debtorKey = 0x111;
    uint256 public creditorKey = 0x222;

    uint32 public dateEpochCounter = 1;
    uint32 public constant ZONE_ID = 1;

    uint256[3] internal oracleKeys = [0x101, 0x102, 0x103];

    // Track active statements posted
    uint32[] public activeEpochs;

    constructor(
        BatchSettlement _settlement,
        Escrow _escrow,
        MockERC20 _token,
        AccessRegistry _access,
        ParticipantRegistry _participants,
        EpochOracle _oracle
    ) {
        settlement = _settlement;
        escrow = _escrow;
        token = _token;
        access = _access;
        participants = _participants;
        oracle = _oracle;
    }

    function activeEpochsCount() external view returns (uint256) {
        return activeEpochs.length;
    }

    function postStatementAndSettle(uint256 tradeAmount) public {
        tradeAmount = bound(tradeAmount, 100, 10_000);

        // Ensure debtor has funded free balance in escrow
        uint256 debtorFree = escrow.getFreeBalance(debtor);
        if (debtorFree < tradeAmount) {
            uint256 needed = tradeAmount - debtorFree;
            vm.prank(debtor);
            escrow.deposit(needed);
        }

        uint32 dateEpoch = dateEpochCounter++;

        int256 debtorNet = -int256(tradeAmount);
        int256 creditorNet = int256(tradeAmount);

        bytes32 leaf0 = keccak256(
            abi.encodePacked(
                bytes1(0x02),
                debtor,
                dateEpoch,
                debtorNet,
                uint64(1000),
                uint64(0),
                uint64(0),
                uint32(0)
            )
        );
        bytes32 leaf1 = keccak256(
            abi.encodePacked(
                bytes1(0x02),
                creditor,
                dateEpoch,
                creditorNet,
                uint64(1000),
                uint64(0),
                uint64(0),
                uint32(1)
            )
        );

        bytes32 statementRoot = leaf0 < leaf1
            ? keccak256(abi.encodePacked(leaf0, leaf1))
            : keccak256(abi.encodePacked(leaf1, leaf0));

        bytes32 msgHash = keccak256(
            abi.encodePacked(
                block.chainid,
                address(settlement),
                dateEpoch,
                ZONE_ID,
                statementRoot,
                tradeAmount,
                tradeAmount
            )
        ).toEthSignedMessageHash();

        bytes[] memory sigs = new bytes[](3);
        for (uint256 i = 0; i < 3; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(oracleKeys[i], msgHash);
            sigs[i] = abi.encodePacked(r, s, v);
        }

        vm.prank(operator);
        settlement.postDailyStatement(dateEpoch, ZONE_ID, statementRoot, tradeAmount, tradeAmount, sigs);

        activeEpochs.push(dateEpoch);

        // Debtor claims debit first (debtor pays into pool)
        bytes32[] memory proofDebtor = new bytes32[](1);
        proofDebtor[0] = leaf1;
        settlement.claimSettlement(debtor, dateEpoch, ZONE_ID, debtorNet, 1000, 0, 0, 0, proofDebtor);

        // Creditor claims credit (funded by debtor)
        bytes32[] memory proofCreditor = new bytes32[](1);
        proofCreditor[0] = leaf0;
        settlement.claimSettlement(creditor, dateEpoch, ZONE_ID, creditorNet, 1000, 0, 0, 1, proofCreditor);
    }
}

contract BatchSettlementInvariantTest is Test {
    AccessRegistry public access;
    ParticipantRegistry public participants;
    DeviceRegistry public devices;
    EpochOracle public oracle;
    Escrow public escrow;
    BatchSettlement public settlement;
    MockERC20 public token;
    BatchSettlementHandler public handler;

    address public admin = address(0xAD);
    address public operator = address(0x09);
    address public debtor = address(0x111);
    address public creditor = address(0x222);

    uint256[3] internal oracleKeys = [0x101, 0x102, 0x103];
    address[3] internal oracleAddrs;

    function setUp() public {
        vm.startPrank(admin);
        access = new AccessRegistry(admin);
        access.grantRole(access.REGISTRAR_ROLE(), admin);
        participants = new ParticipantRegistry(address(access));
        devices = new DeviceRegistry(address(access));

        for (uint256 i = 0; i < 3; i++) {
            oracleAddrs[i] = vm.addr(oracleKeys[i]);
        }
        for (uint256 i = 0; i < 3; i++) {
            for (uint256 j = i + 1; j < 3; j++) {
                if (oracleAddrs[i] > oracleAddrs[j]) {
                    address tA = oracleAddrs[i];
                    oracleAddrs[i] = oracleAddrs[j];
                    oracleAddrs[j] = tA;
                    uint256 tK = oracleKeys[i];
                    oracleKeys[i] = oracleKeys[j];
                    oracleKeys[j] = tK;
                }
            }
        }

        for (uint256 i = 0; i < 3; i++) {
            access.grantRole(access.ORACLE_ROLE(), oracleAddrs[i]);
        }
        access.grantRole(access.OPERATOR_ROLE(), operator);

        oracle = new EpochOracle(address(access), 3);
        token = new MockERC20("Settlement Token", "sINR");
        escrow = new Escrow(address(token), address(access));
        settlement = new BatchSettlement(
            address(access),
            address(participants),
            address(oracle),
            payable(address(escrow))
        );
        escrow.setSettlementContract(address(settlement));

        // Register debtor and creditor
        participants.registerParticipant(
            debtor,
            keccak256("part-debtor"),
            1,
            ParticipantRegistry.RoleType.CONSUMER,
            keccak256("acc-debtor")
        );
        participants.registerParticipant(
            creditor,
            keccak256("part-creditor"),
            1,
            ParticipantRegistry.RoleType.PROSUMER,
            keccak256("acc-creditor")
        );

        // Mint token supplies
        token.mint(debtor, 10_000_000);
        token.mint(creditor, 10_000_000);
        vm.stopPrank();

        vm.prank(debtor);
        token.approve(address(escrow), type(uint256).max);
        vm.prank(creditor);
        token.approve(address(escrow), type(uint256).max);

        handler = new BatchSettlementHandler(
            settlement,
            escrow,
            token,
            access,
            participants,
            oracle
        );

        targetContract(address(handler));
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 64
    function invariant_SettlementSolvency() public view {
        uint256 count = handler.activeEpochsCount();
        for (uint256 i = 0; i < count; i++) {
            uint32 epoch = handler.activeEpochs(i);
            (
                ,
                ,
                ,
                ,
                ,
                uint256 totalCollectedDebitsPaise,
                uint256 totalClaimedCreditsPaise,
                
            ) = settlement.dailyStatements(epoch, 1);

            assertLe(totalClaimedCreditsPaise, totalCollectedDebitsPaise);
        }
    }
}
