// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccessRegistry.sol";
import "../src/Escrow.sol";
import "../src/mocks/MockERC20.sol";

contract EscrowReclaimTest is Test {
    AccessRegistry public access;
    Escrow public escrow;
    MockERC20 public token;

    address public admin = address(0xAD);
    address public settlement = address(0x5E);
    address public buyer = address(0xB1);
    address public seller = address(0x51);

    bytes32 public constant OBLIGATION_ID = keccak256("obligation-1");
    uint256 public constant AMOUNT = 1000;
    uint64 public deadline;

    event ObligationStateChanged(bytes32 indexed obligationId, Escrow.EscrowState oldState, Escrow.EscrowState newState);

    function setUp() public {
        vm.startPrank(admin);
        access = new AccessRegistry(admin);
        token = new MockERC20("Settlement Token", "sINR");
        escrow = new Escrow(address(token), address(access));
        escrow.setSettlementContract(settlement);
        token.mint(buyer, 10_000);
        token.mint(seller, 10_000);
        vm.stopPrank();

        vm.prank(buyer);
        token.approve(address(escrow), type(uint256).max);
        vm.prank(buyer);
        escrow.deposit(5_000);

        deadline = uint64(block.timestamp + 100);

        vm.prank(settlement);
        escrow.lockObligationCollateral(OBLIGATION_ID, buyer, seller, AMOUNT, 1, 10, deadline);
    }

    function test_RefundBlockedInDeliveryVerifiedAfterDeadline() public {
        // Transition to DELIVERY_VERIFIED before deadline
        vm.prank(settlement);
        escrow.updateObligationState(OBLIGATION_ID, Escrow.EscrowState.DELIVERY_VERIFIED);

        // Advance past deadline
        vm.warp(deadline + 1);

        // Buyer attempt to claim expired refund must revert with InvalidObligationState
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(
                Escrow.InvalidObligationState.selector,
                OBLIGATION_ID,
                Escrow.EscrowState.DELIVERY_VERIFIED,
                Escrow.EscrowState.LOCKED
            )
        );
        escrow.claimExpiredRefund(OBLIGATION_ID);
    }

    function test_RefundBlockedInSettlementReadyAfterDeadline() public {
        vm.startPrank(settlement);
        escrow.updateObligationState(OBLIGATION_ID, Escrow.EscrowState.DELIVERY_VERIFIED);
        escrow.updateObligationState(OBLIGATION_ID, Escrow.EscrowState.SETTLEMENT_READY);
        vm.stopPrank();

        vm.warp(deadline + 1);

        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(
                Escrow.InvalidObligationState.selector,
                OBLIGATION_ID,
                Escrow.EscrowState.SETTLEMENT_READY,
                Escrow.EscrowState.LOCKED
            )
        );
        escrow.claimExpiredRefund(OBLIGATION_ID);
    }

    function test_RefundAllowedInLockedAfterDeadline() public {
        vm.warp(deadline + 1);

        vm.expectEmit(true, true, true, true);
        emit ObligationStateChanged(OBLIGATION_ID, Escrow.EscrowState.LOCKED, Escrow.EscrowState.REFUNDED);

        vm.prank(buyer);
        escrow.claimExpiredRefund(OBLIGATION_ID);

        (,,,,,,Escrow.EscrowState state,,,) = escrow.obligationLocks(OBLIGATION_ID);
        assertEq(uint8(state), uint8(Escrow.EscrowState.REFUNDED));
    }

    function test_SettleWorksAfterDeadlineOnceVerified() public {
        vm.startPrank(settlement);
        escrow.updateObligationState(OBLIGATION_ID, Escrow.EscrowState.DELIVERY_VERIFIED);
        escrow.updateObligationState(OBLIGATION_ID, Escrow.EscrowState.SETTLEMENT_READY);
        vm.stopPrank();

        // Warp past deadline
        vm.warp(deadline + 500);

        vm.expectEmit(true, true, true, true);
        emit ObligationStateChanged(OBLIGATION_ID, Escrow.EscrowState.SETTLEMENT_READY, Escrow.EscrowState.SETTLED);

        // Settle must succeed even after deadline
        vm.prank(settlement);
        escrow.settleObligation(OBLIGATION_ID, AMOUNT);

        (,,,,,,Escrow.EscrowState state,,,) = escrow.obligationLocks(OBLIGATION_ID);
        assertEq(uint8(state), uint8(Escrow.EscrowState.SETTLED));
    }

    function test_DeliveryVerificationRevertsAfterDeadline() public {
        vm.warp(deadline + 1);

        vm.prank(settlement);
        vm.expectRevert(
            abi.encodeWithSelector(
                Escrow.ObligationExpired.selector,
                OBLIGATION_ID,
                block.timestamp,
                deadline
            )
        );
        escrow.updateObligationState(OBLIGATION_ID, Escrow.EscrowState.DELIVERY_VERIFIED);
    }
}
