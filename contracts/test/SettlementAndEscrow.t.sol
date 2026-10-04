// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "../src/AccessRegistry.sol";
import "../src/ParticipantRegistry.sol";
import "../src/DeviceRegistry.sol";
import "../src/EpochOracle.sol";
import "../src/Escrow.sol";
import "../src/BatchSettlement.sol";
import "../src/mocks/MockERC20.sol";

contract SettlementAndEscrowTest is Test {
    using MessageHashUtils for bytes32;

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

    uint256 public oracleKey = 0x101;
    address public oracleAddr;

    function setUp() public {
        oracleAddr = vm.addr(oracleKey);

        vm.startPrank(admin);
        access = new AccessRegistry(admin);
        access.grantRole(access.OPERATOR_ROLE(), operator);
        access.grantRole(access.REGISTRAR_ROLE(), admin);
        access.grantRole(access.ORACLE_ROLE(), oracleAddr);

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

    function _signStatement(
        uint32 dateEpoch,
        uint32 zoneId,
        bytes32 statementRoot,
        uint256 totalCredits,
        uint256 totalDebits
    ) internal view returns (bytes[] memory) {
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                block.chainid,
                address(settlement),
                dateEpoch,
                zoneId,
                statementRoot,
                totalCredits,
                totalDebits
            )
        ).toEthSignedMessageHash();

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oracleKey, messageHash);
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = abi.encodePacked(r, s, v);
        return sigs;
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

        bytes32 statementRoot = leafHash;

        // Deposit settlement funds to settlement contract in escrow
        vm.prank(admin);
        token.transfer(address(settlement), 10_000);
        vm.startPrank(address(settlement));
        token.approve(address(escrow), 10_000);
        escrow.deposit(10_000);
        vm.stopPrank();

        bytes[] memory sigs = _signStatement(dateEpoch, zoneId, statementRoot, 5000, 5000);

        // Operator posts daily statement with oracle quorum signatures
        vm.prank(operator);
        settlement.postDailyStatement(dateEpoch, zoneId, statementRoot, 5000, 5000, sigs);

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

    function test_Escrow_ObligationState_LockSettleAndRefund() public {
        address buyer = address(0xB0B);
        address seller = prosumer;
        bytes32 obligationId = keccak256("obl-001");
        uint256 tradeAmount = 10_000;
        uint64 deadline = uint64(block.timestamp + 86400);

        // Fund buyer and deposit into escrow
        vm.startPrank(admin);
        token.transfer(buyer, 20_000);
        vm.stopPrank();

        vm.startPrank(buyer);
        token.approve(address(escrow), 20_000);
        escrow.deposit(20_000);
        vm.stopPrank();

        assertEq(escrow.getFreeBalance(buyer), 20_000);

        // Operator locks obligation through settlement contract
        vm.prank(operator);
        settlement.lockObligation(obligationId, buyer, seller, tradeAmount, 1, 48, deadline);

        assertEq(escrow.lockedBalances(buyer), tradeAmount);
        assertEq(escrow.getFreeBalance(buyer), 10_000);

        (
            bytes32 oblId,
            address lBuyer,
            address lSeller,
            uint256 lAmt,
            uint32 lZone,
            uint32 lInt,
            Escrow.EscrowState state,
            uint64 createdAt,
            uint64 lDeadline,
            uint64 settledAt
        ) = escrow.obligationLocks(obligationId);

        assertEq(oblId, obligationId);
        assertEq(lBuyer, buyer);
        assertEq(lSeller, seller);
        assertEq(lAmt, tradeAmount);
        assertEq(lDeadline, deadline);
        assertEq(uint8(state), uint8(Escrow.EscrowState.LOCKED));

        // Settle obligation: full delivered amount
        uint256 sellerBefore = escrow.balances(seller);
        vm.prank(operator);
        settlement.settleObligation(obligationId, tradeAmount);

        assertEq(escrow.balances(seller), sellerBefore + tradeAmount);
        assertEq(escrow.balances(buyer), 10_000);
        assertEq(escrow.lockedBalances(buyer), 0);

        (, , , , , , Escrow.EscrowState settledState, , , ) = escrow.obligationLocks(obligationId);
        assertEq(uint8(settledState), uint8(Escrow.EscrowState.SETTLED));

        // Re-settling or refunding a settled obligation must revert
        vm.prank(operator);
        vm.expectRevert();
        settlement.settleObligation(obligationId, tradeAmount);

        // Test refund on second obligation
        bytes32 obligationId2 = keccak256("obl-002");
        vm.prank(operator);
        settlement.lockObligation(obligationId2, buyer, seller, 5000, 1, 49, deadline);

        assertEq(escrow.lockedBalances(buyer), 5000);
        assertEq(escrow.getFreeBalance(buyer), 5000);

        vm.prank(operator);
        settlement.refundObligation(obligationId2);

        assertEq(escrow.lockedBalances(buyer), 0);
        assertEq(escrow.getFreeBalance(buyer), 10_000);

        (, , , , , , Escrow.EscrowState refundedState, , , ) = escrow.obligationLocks(obligationId2);
        assertEq(uint8(refundedState), uint8(Escrow.EscrowState.REFUNDED));
    }

    // P0-2: Explicit illegal state transitions must all revert
    function test_Escrow_IllegalStateTransitionsRevert() public {
        address buyer = address(0xB0B);
        address seller = prosumer;
        bytes32 obligationId = keccak256("obl-transitions-01");
        uint64 deadline = uint64(block.timestamp + 86400);

        vm.startPrank(admin);
        token.transfer(buyer, 20_000);
        vm.stopPrank();

        vm.startPrank(buyer);
        token.approve(address(escrow), 20_000);
        escrow.deposit(20_000);
        vm.stopPrank();

        // 1. Unregistered obligation (NONE) cannot transition to SETTLED or REFUNDED
        vm.startPrank(address(settlement));
        vm.expectRevert(abi.encodeWithSelector(Escrow.ObligationNotFound.selector, obligationId));
        escrow.updateObligationState(obligationId, Escrow.EscrowState.SETTLED);
        vm.stopPrank();

        // Lock obligation
        vm.prank(operator);
        settlement.lockObligation(obligationId, buyer, seller, 5000, 1, 48, deadline);

        // 2. LOCKED cannot transition to NONE
        vm.startPrank(address(settlement));
        vm.expectRevert();
        escrow.updateObligationState(obligationId, Escrow.EscrowState.NONE);

        // 3. Transition to DELIVERY_VERIFIED
        escrow.updateObligationState(obligationId, Escrow.EscrowState.DELIVERY_VERIFIED);

        // 4. DELIVERY_VERIFIED cannot jump back to LOCKED
        vm.expectRevert(
            abi.encodeWithSelector(
                Escrow.InvalidObligationStateTransition.selector,
                obligationId,
                Escrow.EscrowState.DELIVERY_VERIFIED,
                Escrow.EscrowState.LOCKED
            )
        );
        escrow.updateObligationState(obligationId, Escrow.EscrowState.LOCKED);

        // 5. Transition to SETTLED
        escrow.updateObligationState(obligationId, Escrow.EscrowState.SETTLED);

        // 6. Terminal state SETTLED cannot transition anywhere
        vm.expectRevert(
            abi.encodeWithSelector(
                Escrow.InvalidObligationStateTransition.selector,
                obligationId,
                Escrow.EscrowState.SETTLED,
                Escrow.EscrowState.LOCKED
            )
        );
        escrow.updateObligationState(obligationId, Escrow.EscrowState.LOCKED);

        vm.expectRevert(
            abi.encodeWithSelector(
                Escrow.InvalidObligationStateTransition.selector,
                obligationId,
                Escrow.EscrowState.SETTLED,
                Escrow.EscrowState.REFUNDED
            )
        );
        escrow.updateObligationState(obligationId, Escrow.EscrowState.REFUNDED);
        vm.stopPrank();
    }

    // P0-3: Strict accounting check - no silent balance clamping
    function test_Escrow_NoSilentClamping_RevertsOnExcessiveAmount() public {
        address buyer = address(0xB0B);
        address seller = prosumer;
        bytes32 obligationId = keccak256("obl-clamping-01");
        uint64 deadline = uint64(block.timestamp + 86400);

        vm.startPrank(admin);
        token.transfer(buyer, 20_000);
        vm.stopPrank();

        vm.startPrank(buyer);
        token.approve(address(escrow), 20_000);
        escrow.deposit(20_000);
        vm.stopPrank();

        vm.prank(operator);
        settlement.lockObligation(obligationId, buyer, seller, 5000, 1, 48, deadline);

        // Attempting to settle more than the obligation amount must revert InvalidAmount
        vm.prank(operator);
        vm.expectRevert(Escrow.InvalidAmount.selector);
        settlement.settleObligation(obligationId, 6000);

        // State remains strictly LOCKED and balances remain untouched
        assertEq(escrow.lockedBalances(buyer), 5000);
        assertEq(escrow.balances(buyer), 20_000);
    }

    // P0-4: Escrow liveness - expired obligation recovery by buyer
    function test_Escrow_Liveness_BuyerExpiredRecovery() public {
        address buyer = address(0xB0B);
        address seller = prosumer;
        bytes32 obligationId = keccak256("obl-liveness-01");
        uint64 deadline = uint64(block.timestamp + 3600); // 1 hour deadline

        vm.startPrank(admin);
        token.transfer(buyer, 10_000);
        vm.stopPrank();

        vm.startPrank(buyer);
        token.approve(address(escrow), 10_000);
        escrow.deposit(10_000);
        vm.stopPrank();

        vm.prank(operator);
        settlement.lockObligation(obligationId, buyer, seller, 10_000, 1, 48, deadline);

        // Attempting recovery before deadline must revert
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(
                Escrow.ObligationNotExpired.selector,
                obligationId,
                block.timestamp,
                deadline
            )
        );
        escrow.claimExpiredRefund(obligationId);

        // Advance timestamp past deadline
        vm.warp(deadline + 1);

        // Settlement after expiry must revert
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                Escrow.ObligationExpired.selector,
                obligationId,
                deadline + 1,
                deadline
            )
        );
        settlement.settleObligation(obligationId, 10_000);

        // Buyer reclaims collateral
        vm.prank(buyer);
        escrow.claimExpiredRefund(obligationId);

        assertEq(escrow.lockedBalances(buyer), 0);
        assertEq(escrow.balances(buyer), 10_000);

        // Second recovery must revert
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(
                Escrow.ObligationAlreadyTerminated.selector,
                obligationId,
                Escrow.EscrowState.REFUNDED
            )
        );
        escrow.claimExpiredRefund(obligationId);
    }

    // P0-5 & P0-6: Economic conservation violation must revert
    function test_BatchSettlement_EconomicConservationEnforced() public {
        uint32 zoneId = 1;
        uint32 dateEpoch = 20000;
        bytes32 statementRoot = keccak256("fake-root");

        // Attempting to post statement where Credits (6000) > Debits (5000) must revert
        bytes[] memory emptySigs = new bytes[](0);
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                BatchSettlement.EconomicConservationViolation.selector,
                5000, // Debits
                6000  // Credits
            )
        );
        settlement.postDailyStatement(dateEpoch, zoneId, statementRoot, 6000, 5000, emptySigs);
    }

    // P0-6: Malicious operator cannot post statement without oracle signatures
    function test_BatchSettlement_MaliciousOperatorDrainingBlocked() public {
        uint32 zoneId = 1;
        uint32 dateEpoch = 20000;
        bytes32 fakeRoot = keccak256("fake-draining-root");

        // Unsigned statement must revert
        bytes[] memory emptySigs = new bytes[](0);
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                BatchSettlement.InsufficientOracleSignatures.selector,
                0,
                1
            )
        );
        settlement.postDailyStatement(dateEpoch, zoneId, fakeRoot, 5000, 5000, emptySigs);
    }

    function test_BatchSettlement_EIP712OrderHashAndCancellation() public {
        address maker = prosumer;
        uint32 zone = 1;
        uint32 interval = 48;
        uint8 side = 1; // SELL
        uint64 quantityWh = 2500;
        uint64 pricePaisePerKWh = 450;
        uint256 nonce = 101;
        uint256 expiry = block.timestamp + 3600;

        bytes32 orderHash = settlement.hashEnergyOrder(
            maker,
            zone,
            interval,
            side,
            quantityWh,
            pricePaisePerKWh,
            nonce,
            expiry
        );

        assertTrue(orderHash != bytes32(0));
        assertFalse(settlement.isOrderCancelled(maker, nonce));

        // Cancel order from prosumer wallet
        vm.prank(maker);
        settlement.cancelOrder(nonce);

        assertTrue(settlement.isOrderCancelled(maker, nonce));
    }

    // Step 1 Hardening: Self-settlement (buyer == seller) must strictly revert on-chain
    function test_Escrow_SelfSettlementBlocked_Reverts() public {
        address user = prosumer;
        bytes32 obligationId = keccak256("obl-self-match-01");
        uint64 deadline = uint64(block.timestamp + 86400);

        vm.startPrank(admin);
        token.transfer(user, 20_000);
        vm.stopPrank();

        vm.startPrank(user);
        token.approve(address(escrow), 20_000);
        escrow.deposit(20_000);
        vm.stopPrank();

        // 1. Attempting to lock an obligation where buyer == seller must revert with InvalidParticipants
        vm.prank(operator);
        vm.expectRevert(Escrow.InvalidParticipants.selector);
        settlement.lockObligation(obligationId, user, user, 5000, 1, 48, deadline);

        // Verify no obligation was created
        (, , , , , , Escrow.EscrowState state, , , ) = escrow.obligationLocks(obligationId);
        assertEq(uint8(state), uint8(Escrow.EscrowState.NONE));
        assertEq(escrow.lockedBalances(user), 0);
        assertEq(escrow.getFreeBalance(user), 20_000);

        // 2. Direct settlement transfer where from == to must revert with InvalidParticipants
        vm.prank(address(settlement));
        vm.expectRevert(Escrow.InvalidParticipants.selector);
        escrow.executeSettlementTransfer(user, user, 1000);
    }
}
