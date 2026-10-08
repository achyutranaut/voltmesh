// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "../src/AccessRegistry.sol";
import "../src/ParticipantRegistry.sol";
import "../src/EpochOracle.sol";
import "../src/Escrow.sol";
import "../src/BatchSettlement.sol";
import "../src/mocks/MockERC20.sol";

contract BatchSettlementKeeperTest is Test {
    using MessageHashUtils for bytes32;

    AccessRegistry public access;
    ParticipantRegistry public participants;
    EpochOracle public oracle;
    Escrow public escrow;
    BatchSettlement public settlement;
    MockERC20 public token;

    address public admin = address(0xAD);
    address public operator = address(0x09);
    address public keeper = address(0x999);
    address public debtor = address(0xDB7);
    address public creditor = address(0xCD7);

    uint256 public oracleKey = 0x101;
    address public oracleAddr;

    uint32 public dateEpoch = 20261009;
    uint32 public zoneId = 1;

    bytes32 public statementRoot;
    bytes32[] public proofDebtor;
    bytes32[] public proofCreditor;

    int256 public debtorNet = -5000; // -50 INR
    int256 public creditorNet = 5000; // +50 INR

    event SettlementClaimed(
        address indexed participant,
        uint32 indexed dateEpoch,
        uint32 indexed zoneId,
        int256 netAmountPaise,
        uint32 leafIndex
    );

    function setUp() public {
        oracleAddr = vm.addr(oracleKey);

        vm.startPrank(admin);
        access = new AccessRegistry(admin);
        access.grantRole(access.OPERATOR_ROLE(), operator);
        access.grantRole(access.REGISTRAR_ROLE(), admin);
        access.grantRole(access.ORACLE_ROLE(), oracleAddr);

        participants = new ParticipantRegistry(address(access));
        oracle = new EpochOracle(address(access), 1);
        token = new MockERC20("Settlement Rupee", "sINR");
        escrow = new Escrow(address(token), address(access));
        settlement = new BatchSettlement(
            address(access),
            address(participants),
            address(oracle),
            payable(address(escrow))
        );
        escrow.setSettlementContract(address(settlement));

        participants.registerParticipant(debtor, keccak256("debtor-01"), 1, ParticipantRegistry.RoleType.CONSUMER, keccak256("bind-debtor"));
        participants.registerParticipant(creditor, keccak256("creditor-01"), 1, ParticipantRegistry.RoleType.PROSUMER, keccak256("bind-creditor"));

        token.mint(debtor, 50_000);
        token.mint(creditor, 50_000);
        vm.stopPrank();

        vm.prank(debtor);
        token.approve(address(escrow), type(uint256).max);
        vm.prank(debtor);
        escrow.deposit(10_000);

        bytes32 leaf0 = keccak256(
            abi.encodePacked(
                bytes1(0x02),
                debtor,
                dateEpoch,
                debtorNet,
                uint64(5000),
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
                uint64(5000),
                uint64(0),
                uint64(0),
                uint32(1)
            )
        );

        proofDebtor = new bytes32[](1);
        proofDebtor[0] = leaf1;

        proofCreditor = new bytes32[](1);
        proofCreditor[0] = leaf0;

        bytes32 h1;
        bytes32 h2;
        if (leaf0 < leaf1) {
            h1 = leaf0;
            h2 = leaf1;
        } else {
            h1 = leaf1;
            h2 = leaf0;
        }
        statementRoot = keccak256(abi.encodePacked(h1, h2));

        bytes32 stmtMsgHash = keccak256(
            abi.encodePacked(
                block.chainid,
                address(settlement),
                dateEpoch,
                zoneId,
                statementRoot,
                uint256(5000),
                uint256(5000)
            )
        ).toEthSignedMessageHash();

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oracleKey, stmtMsgHash);
        bytes memory oracleSig = abi.encodePacked(r, s, v);
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = oracleSig;

        vm.prank(operator);
        settlement.postDailyStatement(dateEpoch, zoneId, statementRoot, 5000, 5000, sigs);
    }

    function test_CreditorClaimBeforeDebitRevertsSettlementPoolExhausted() public {
        vm.prank(keeper);
        vm.expectRevert(BatchSettlement.SettlementPoolExhausted.selector);
        settlement.claimSettlement(
            creditor,
            dateEpoch,
            zoneId,
            creditorNet,
            5000,
            0,
            0,
            1,
            proofCreditor
        );
    }

    function test_KeeperCanExecuteDebtorThenCreditor() public {
        // 1. Keeper executes debtor leaf
        vm.expectEmit(true, true, true, true);
        emit SettlementClaimed(debtor, dateEpoch, zoneId, debtorNet, 0);

        vm.prank(keeper);
        settlement.claimSettlement(
            debtor,
            dateEpoch,
            zoneId,
            debtorNet,
            5000,
            0,
            0,
            0,
            proofDebtor
        );

        // Debtor was debited 5000 into settlement contract
        assertEq(escrow.getFreeBalance(debtor), 5000);
        assertEq(escrow.getFreeBalance(address(settlement)), 5000);

        // 2. Keeper executes creditor leaf
        vm.expectEmit(true, true, true, true);
        emit SettlementClaimed(creditor, dateEpoch, zoneId, creditorNet, 1);

        vm.prank(keeper);
        settlement.claimSettlement(
            creditor,
            dateEpoch,
            zoneId,
            creditorNet,
            5000,
            0,
            0,
            1,
            proofCreditor
        );

        // Creditor received 5000 credit in escrow
        assertEq(escrow.getFreeBalance(creditor), 5000);
        assertEq(escrow.getFreeBalance(address(settlement)), 0);

        // 3. Double claim reverts LeafAlreadyClaimed
        vm.prank(keeper);
        bytes32 nullifier = keccak256(abi.encodePacked(dateEpoch, zoneId, uint32(1)));
        vm.expectRevert(abi.encodeWithSelector(BatchSettlement.LeafAlreadyClaimed.selector, nullifier));
        settlement.claimSettlement(
            creditor,
            dateEpoch,
            zoneId,
            creditorNet,
            5000,
            0,
            0,
            1,
            proofCreditor
        );
    }
}
