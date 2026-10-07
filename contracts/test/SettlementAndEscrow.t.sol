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

        bytes[] memory sigs = _signStatement(dateEpoch, zoneId, statementRoot, 5000, 5000);

        // Operator posts daily statement with oracle quorum signatures
        vm.prank(operator);
        settlement.postDailyStatement(dateEpoch, zoneId, statementRoot, 5000, 5000, sigs);

        // Operator funds statement shortfall so collected debits cover the claims
        vm.prank(admin);
        token.transfer(operator, 5000);
        vm.startPrank(operator);
        token.approve(address(settlement), 5000);
        settlement.fundStatementShortfall(dateEpoch, zoneId, 5000);
        vm.stopPrank();

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
        vm.startPrank(operator);
        settlement.updateObligationState(obligationId, Escrow.EscrowState.DELIVERY_VERIFIED);
        settlement.updateObligationState(obligationId, Escrow.EscrowState.SETTLEMENT_READY);
        settlement.settleObligation(obligationId, tradeAmount);
        vm.stopPrank();

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

        // 2b. LOCKED cannot jump directly to SETTLED without delivery verification (Attack 19)
        vm.expectRevert(
            abi.encodeWithSelector(
                Escrow.InvalidObligationStateTransition.selector,
                obligationId,
                Escrow.EscrowState.LOCKED,
                Escrow.EscrowState.SETTLED
            )
        );
        escrow.updateObligationState(obligationId, Escrow.EscrowState.SETTLED);

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

        // 4b. DELIVERY_VERIFIED cannot jump directly to SETTLED without SETTLEMENT_READY
        vm.expectRevert(
            abi.encodeWithSelector(
                Escrow.InvalidObligationStateTransition.selector,
                obligationId,
                Escrow.EscrowState.DELIVERY_VERIFIED,
                Escrow.EscrowState.SETTLED
            )
        );
        escrow.updateObligationState(obligationId, Escrow.EscrowState.SETTLED);

        // 5. Transition to SETTLEMENT_READY, then SETTLED
        escrow.updateObligationState(obligationId, Escrow.EscrowState.SETTLEMENT_READY);
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

        // Advance lifecycle: DELIVERY_VERIFIED -> SETTLEMENT_READY
        vm.startPrank(operator);
        settlement.updateObligationState(obligationId, Escrow.EscrowState.DELIVERY_VERIFIED);
        settlement.updateObligationState(obligationId, Escrow.EscrowState.SETTLEMENT_READY);

        // Attempting to settle more than the obligation amount must revert InvalidAmount
        vm.expectRevert(Escrow.InvalidAmount.selector);
        settlement.settleObligation(obligationId, 6000);
        vm.stopPrank();

        // State remains strictly SETTLEMENT_READY and balances remain untouched
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

        // Advance lifecycle: DELIVERY_VERIFIED -> SETTLEMENT_READY
        vm.startPrank(operator);
        settlement.updateObligationState(obligationId, Escrow.EscrowState.DELIVERY_VERIFIED);
        settlement.updateObligationState(obligationId, Escrow.EscrowState.SETTLEMENT_READY);
        vm.stopPrank();

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

    function test_Escrow_SetSettlementContractSetOnce() public {
        vm.prank(admin);
        vm.expectRevert(Escrow.AlreadyInitialized.selector);
        escrow.setSettlementContract(address(0x123));
    }

    // PHASE 2 REGRESSION TESTS: Real Accounting & Settlement Invariant
    function test_Settlement_OneBuyerOneSeller_RealAccountingFlow() public {
        address buyer = address(0xB001);
        address seller = prosumer;
        bytes32 obligationId = keccak256("obl-real-acct-01");
        uint256 tradeAmount = 6000;
        uint64 deadline = uint64(block.timestamp + 86400);

        // Fund buyer
        vm.startPrank(admin);
        token.transfer(buyer, 10_000);
        vm.stopPrank();

        // Buyer deposits 10,000 into Escrow
        vm.startPrank(buyer);
        token.approve(address(escrow), 10_000);
        escrow.deposit(10_000);
        vm.stopPrank();

        uint256 buyerBalInitial = escrow.balances(buyer);
        uint256 sellerBalInitial = escrow.balances(seller);
        assertEq(buyerBalInitial, 10_000);
        assertEq(sellerBalInitial, 0);

        // Operator locks obligation
        vm.prank(operator);
        settlement.lockObligation(obligationId, buyer, seller, tradeAmount, 1, 48, deadline);

        assertEq(escrow.lockedBalances(buyer), tradeAmount);
        assertEq(escrow.getFreeBalance(buyer), 4000);

        // Advance lifecycle: DELIVERY_VERIFIED -> SETTLEMENT_READY
        vm.startPrank(operator);
        settlement.updateObligationState(obligationId, Escrow.EscrowState.DELIVERY_VERIFIED);
        settlement.updateObligationState(obligationId, Escrow.EscrowState.SETTLEMENT_READY);

        // Settle obligation
        settlement.settleObligation(obligationId, tradeAmount);
        vm.stopPrank();

        // 1. Buyer balance decreased
        assertEq(escrow.balances(buyer), buyerBalInitial - tradeAmount);
        assertEq(escrow.lockedBalances(buyer), 0);
        assertEq(escrow.getFreeBalance(buyer), 4000);

        // 2. Seller balance increased
        assertEq(escrow.balances(seller), sellerBalInitial + tradeAmount);

        // 3. Exact conservation
        assertEq(escrow.balances(buyer) + escrow.balances(seller), 10_000);
        assertEq(escrow.totalDeposited(), 10_000);
    }

    function test_Settlement_PartialDelivery_ExcessUnlockedForBuyer() public {
        address buyer = address(0xB002);
        address seller = prosumer;
        bytes32 obligationId = keccak256("obl-partial-01");
        uint256 lockedAmount = 10_000;
        uint256 deliveredAmount = 7000; // Partial delivery
        uint64 deadline = uint64(block.timestamp + 86400);

        vm.startPrank(admin);
        token.transfer(buyer, 10_000);
        vm.stopPrank();

        vm.startPrank(buyer);
        token.approve(address(escrow), 10_000);
        escrow.deposit(10_000);
        vm.stopPrank();

        vm.startPrank(operator);
        settlement.lockObligation(obligationId, buyer, seller, lockedAmount, 1, 48, deadline);
        settlement.updateObligationState(obligationId, Escrow.EscrowState.DELIVERY_VERIFIED);
        settlement.updateObligationState(obligationId, Escrow.EscrowState.SETTLEMENT_READY);

        // Settle partial amount
        settlement.settleObligation(obligationId, deliveredAmount);
        vm.stopPrank();

        // Seller receives delivered amount
        assertEq(escrow.balances(seller), deliveredAmount);

        // Buyer only charged delivered amount; 3,000 remaining unlocked as free balance
        assertEq(escrow.balances(buyer), 3000);
        assertEq(escrow.lockedBalances(buyer), 0);
        assertEq(escrow.getFreeBalance(buyer), 3000);

        // Exact conservation
        assertEq(escrow.balances(buyer) + escrow.balances(seller), 10_000);
    }

    function test_Settlement_MultipleBuyersAndSellers_Conservation() public {
        address buyer1 = address(0xB1);
        address buyer2 = address(0xB2);
        address seller1 = address(0x5111);
        address seller2 = address(0x5222);

        bytes32 partS1 = keccak256("part-s1");
        bytes32 partS2 = keccak256("part-s2");

        vm.startPrank(admin);
        participants.registerParticipant(seller1, partS1, 1, ParticipantRegistry.RoleType.PROSUMER, keccak256("b-s1"));
        participants.registerParticipant(seller2, partS2, 1, ParticipantRegistry.RoleType.PROSUMER, keccak256("b-s2"));
        token.transfer(buyer1, 20_000);
        token.transfer(buyer2, 15_000);
        vm.stopPrank();

        vm.startPrank(buyer1);
        token.approve(address(escrow), 20_000);
        escrow.deposit(20_000);
        vm.stopPrank();

        vm.startPrank(buyer2);
        token.approve(address(escrow), 15_000);
        escrow.deposit(15_000);
        vm.stopPrank();

        uint64 deadline = uint64(block.timestamp + 86400);

        vm.startPrank(operator);
        settlement.lockObligation(keccak256("obl-m1"), buyer1, seller1, 12_000, 1, 48, deadline);
        settlement.lockObligation(keccak256("obl-m2"), buyer2, seller2, 8000, 1, 48, deadline);

        settlement.updateObligationState(keccak256("obl-m1"), Escrow.EscrowState.DELIVERY_VERIFIED);
        settlement.updateObligationState(keccak256("obl-m1"), Escrow.EscrowState.SETTLEMENT_READY);
        settlement.updateObligationState(keccak256("obl-m2"), Escrow.EscrowState.DELIVERY_VERIFIED);
        settlement.updateObligationState(keccak256("obl-m2"), Escrow.EscrowState.SETTLEMENT_READY);

        settlement.settleObligation(keccak256("obl-m1"), 12_000);
        settlement.settleObligation(keccak256("obl-m2"), 8000);
        vm.stopPrank();

        assertEq(escrow.balances(buyer1), 8000);
        assertEq(escrow.balances(buyer2), 7000);
        assertEq(escrow.balances(seller1), 12_000);
        assertEq(escrow.balances(seller2), 8000);

        // Economic Conservation Invariant
        uint256 totalBalances = escrow.balances(buyer1) + escrow.balances(buyer2) + escrow.balances(seller1) + escrow.balances(seller2);
        assertEq(totalBalances, 35_000);
        assertEq(escrow.totalDeposited(), 35_000);
    }

    function test_Settlement_NegativeNetDebtor_CollectedBeforeCreditorClaims() public {
        address buyer = address(0xDEB001);
        address seller = prosumer;
        bytes32 buyerPartId = keccak256("part-debtor-01");
        uint32 dateEpoch = 25000;
        uint32 zoneId = 1;

        vm.startPrank(admin);
        participants.registerParticipant(buyer, buyerPartId, zoneId, ParticipantRegistry.RoleType.CONSUMER, keccak256("b-debtor"));
        token.transfer(buyer, 10_000);
        vm.stopPrank();

        // Debtor deposits funds in Escrow
        vm.startPrank(buyer);
        token.approve(address(escrow), 10_000);
        escrow.deposit(10_000);
        vm.stopPrank();

        // Daily statement leaves:
        // Leaf 0: Buyer debit of -5000 paise
        // Leaf 1: Seller credit of +5000 paise
        int256 buyerNet = -5000;
        int256 sellerNet = 5000;

        bytes32 leaf0 = keccak256(abi.encodePacked(bytes1(0x02), buyer, dateEpoch, buyerNet, uint64(5000), uint64(0), uint64(0), uint32(0)));
        bytes32 leaf1 = keccak256(abi.encodePacked(bytes1(0x02), seller, dateEpoch, sellerNet, uint64(5000), uint64(0), uint64(0), uint32(1)));

        // Binary Merkle tree root of leaf0 and leaf1
        bytes32 statementRoot;
        if (leaf0 < leaf1) {
            statementRoot = keccak256(abi.encodePacked(leaf0, leaf1));
        } else {
            statementRoot = keccak256(abi.encodePacked(leaf1, leaf0));
        }

        bytes32[] memory proofBuyer = new bytes32[](1);
        proofBuyer[0] = leaf1;
        bytes32[] memory proofSeller = new bytes32[](1);
        proofSeller[0] = leaf0;

        bytes[] memory sigs = _signStatement(dateEpoch, zoneId, statementRoot, 5000, 5000);

        vm.prank(operator);
        settlement.postDailyStatement(dateEpoch, zoneId, statementRoot, 5000, 5000, sigs);

        // 1. Seller claims BEFORE buyer pays -> settlement pool has 0 funds, must revert SettlementPoolExhausted
        vm.prank(seller);
        vm.expectRevert(BatchSettlement.SettlementPoolExhausted.selector);
        settlement.claimSettlement(dateEpoch, zoneId, sellerNet, 5000, 0, 0, 1, proofSeller);

        // 2. Buyer (debtor) claims and pays debit into settlement pool
        vm.prank(buyer);
        settlement.claimSettlement(dateEpoch, zoneId, buyerNet, 5000, 0, 0, 0, proofBuyer);

        assertEq(escrow.balances(buyer), 5000);
        assertEq(escrow.balances(address(settlement)), 5000);

        // 3. Now seller can claim credit successfully funded by buyer's debit
        vm.prank(seller);
        settlement.claimSettlement(dateEpoch, zoneId, sellerNet, 5000, 0, 0, 1, proofSeller);

        assertEq(escrow.balances(seller), 5000);
        assertEq(escrow.balances(address(settlement)), 0);

        // 4. Double claims by either party revert
        vm.prank(buyer);
        vm.expectRevert();
        settlement.claimSettlement(dateEpoch, zoneId, buyerNet, 5000, 0, 0, 0, proofBuyer);

        vm.prank(seller);
        vm.expectRevert();
        settlement.claimSettlement(dateEpoch, zoneId, sellerNet, 5000, 0, 0, 1, proofSeller);

        // 5. Total conservation
        assertEq(escrow.balances(buyer) + escrow.balances(seller), 10_000);
    }
}
