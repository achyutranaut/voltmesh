// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "../src/AccessRegistry.sol";
import "../src/ParticipantRegistry.sol";
import "../src/DeviceRegistry.sol";
import "../src/EpochOracle.sol";
import "../src/Escrow.sol";
import "../src/BatchSettlement.sol";
import "../src/mocks/MockERC20.sol";

contract SettlementAndEscrowTest is Test {
    AccessRegistry public access;
    ParticipantRegistry public participants;
    DeviceRegistry public devices;
    EpochOracle public oracle;
    Escrow public escrow;
    BatchSettlement public settlement;
    MockERC20 public token;

    address public admin = address(0xAD);
    address public operator = address(0x09);
    address public prosumer = address(0xCAFE);

    function setUp() public {
        vm.startPrank(admin);
        access = new AccessRegistry(admin);
        access.grantRole(access.OPERATOR_ROLE(), operator);
        access.grantRole(access.REGISTRAR_ROLE(), admin);

        participants = new ParticipantRegistry(address(access));
        devices = new DeviceRegistry(address(access));
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

        // Register prosumer
        participants.registerParticipant(
            prosumer,
            keccak256("part-cafe"),
            1,
            ParticipantRegistry.RoleType.PROSUMER,
            keccak256("discom-acc-cafe")
        );

        // Fund prosumer with tokens
        token.transfer(prosumer, 100_000);
        vm.stopPrank();
    }

    function test_Escrow_DepositAndWithdraw() public {
        vm.startPrank(prosumer);
        token.approve(address(escrow), 50_000);
        escrow.deposit(50_000);

        assertEq(escrow.balances(prosumer), 50_000);
        assertEq(escrow.getFreeBalance(prosumer), 50_000);

        escrow.withdraw(20_000);
        assertEq(escrow.balances(prosumer), 30_000);
        vm.stopPrank();
    }

    function test_BatchSettlement_CommitAndClaim() public {
        uint32 zoneId = 1;
        uint32 intervalIdx = 100;
        uint32 dateEpoch = 20000;

        // Operator commits clearing
        vm.prank(operator);
        settlement.commitClearing(
            zoneId,
            intervalIdx,
            500, // 500 paise/kWh
            10_000, // 10 kWh
            keccak256("orders-root"),
            keccak256("obligations-root")
        );

        // Setup statement Merkle tree with 1 leaf for prosumer:
        // netAmount = 5000 paise credit, deliveredWh = 10_000, shortfallWh = 0, penalty = 0, leafIndex = 0
        int256 netAmount = 5000;
        uint64 deliveredWh = 10_000;
        uint64 shortfallWh = 0;
        uint64 penalty = 0;
        uint32 leafIndex = 0;

        bytes32 leafHash = keccak256(
            abi.encodePacked(
                bytes1(0x02),
                prosumer,
                dateEpoch,
                netAmount,
                deliveredWh,
                shortfallWh,
                penalty,
                leafIndex
            )
        );

        bytes32 statementRoot = leafHash; // Single leaf tree -> root == leaf

        // Deposit settlement funds to settlement contract in escrow
        vm.prank(admin);
        token.transfer(address(settlement), 10_000);
        vm.startPrank(address(settlement));
        token.approve(address(escrow), 10_000);
        escrow.deposit(10_000);
        vm.stopPrank();

        // Operator posts daily statement
        vm.prank(operator);
        settlement.postDailyStatement(dateEpoch, zoneId, statementRoot, 5000, 0);

        // Prosumer claims settlement
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(prosumer);
        settlement.claimSettlement(
            dateEpoch,
            zoneId,
            netAmount,
            deliveredWh,
            shortfallWh,
            penalty,
            leafIndex,
            emptyProof
        );

        assertEq(escrow.balances(prosumer), 5000);

        // Claiming again must revert
        vm.prank(prosumer);
        vm.expectRevert();
        settlement.claimSettlement(
            dateEpoch,
            zoneId,
            netAmount,
            deliveredWh,
            shortfallWh,
            penalty,
            leafIndex,
            emptyProof
        );
    }
}
