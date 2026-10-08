// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/AccessRegistry.sol";
import "../../src/Escrow.sol";
import "../../src/mocks/MockERC20.sol";

contract EscrowHandler is Test {
    Escrow public escrow;
    MockERC20 public token;

    address[] public actors;
    address internal currentActor;

    // Track created obligations for handler state transitions
    bytes32[] public obligationIds;
    uint256 public nextObligationNonce;

    constructor(Escrow _escrow, MockERC20 _token) {
        escrow = _escrow;
        token = _token;

        actors.push(address(0x111));
        actors.push(address(0x222));
        actors.push(address(0x333));

        for (uint256 i = 0; i < actors.length; i++) {
            vm.prank(actors[i]);
            token.approve(address(escrow), type(uint256).max);
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    modifier useActor(uint256 actorIndexSeed) {
        currentActor = actors[actorIndexSeed % actors.length];
        _;
    }

    function deposit(uint256 actorIndexSeed, uint256 amount) public useActor(actorIndexSeed) {
        uint256 walletBal = token.balanceOf(currentActor);
        if (walletBal == 0) return;
        amount = bound(amount, 1, walletBal > 50_000 ? 50_000 : walletBal);
        vm.prank(currentActor);
        escrow.deposit(amount);
    }

    function withdraw(uint256 actorIndexSeed, uint256 amount) public useActor(actorIndexSeed) {
        uint256 free = escrow.getFreeBalance(currentActor);
        if (free == 0) return;
        amount = bound(amount, 1, free);
        vm.prank(currentActor);
        escrow.withdraw(amount);
    }

    function lockObligationCollateral(
        uint256 buyerSeed,
        uint256 sellerSeed,
        uint256 amount
    ) public {
        uint256 bIdx = buyerSeed % actors.length;
        address buyer = actors[bIdx];
        uint256 sIdx = (bIdx + 1 + (sellerSeed % (actors.length - 1))) % actors.length;
        address seller = actors[sIdx];

        uint256 free = escrow.getFreeBalance(buyer);
        if (free == 0) return;
        amount = bound(amount, 1, free);

        bytes32 obligationId = keccak256(abi.encodePacked("inv-obl", nextObligationNonce++));
        uint64 deadline = uint64(block.timestamp + 1 days);

        // Caller must be settlementContract
        vm.prank(escrow.settlementContract());
        escrow.lockObligationCollateral(obligationId, buyer, seller, amount, 1, 100, deadline);

        obligationIds.push(obligationId);
    }

    function settleObligation(uint256 oblSeed, uint256 settleAmount) public {
        if (obligationIds.length == 0) return;
        bytes32 obligationId = obligationIds[oblSeed % obligationIds.length];

        (
            ,
            ,
            ,
            uint256 amount,
            ,
            ,
            Escrow.EscrowState state,
            ,
            ,
            
        ) = escrow.obligationLocks(obligationId);

        address settlement = escrow.settlementContract();

        // Must transition to DELIVERY_VERIFIED and then SETTLEMENT_READY
        if (state == Escrow.EscrowState.LOCKED) {
            vm.prank(settlement);
            escrow.updateObligationState(obligationId, Escrow.EscrowState.DELIVERY_VERIFIED);
            state = Escrow.EscrowState.DELIVERY_VERIFIED;
        }

        if (state == Escrow.EscrowState.DELIVERY_VERIFIED) {
            vm.prank(settlement);
            escrow.updateObligationState(obligationId, Escrow.EscrowState.SETTLEMENT_READY);
            state = Escrow.EscrowState.SETTLEMENT_READY;
        }

        if (state == Escrow.EscrowState.SETTLEMENT_READY) {
            settleAmount = bound(settleAmount, 0, amount);
            vm.prank(settlement);
            escrow.settleObligation(obligationId, settleAmount);
        }
    }

    function refundObligation(uint256 oblSeed) public {
        if (obligationIds.length == 0) return;
        bytes32 obligationId = obligationIds[oblSeed % obligationIds.length];

        (
            ,
            ,
            ,
            ,
            ,
            ,
            Escrow.EscrowState state,
            ,
            ,
            
        ) = escrow.obligationLocks(obligationId);

        if (
            state == Escrow.EscrowState.LOCKED ||
            state == Escrow.EscrowState.DELIVERY_VERIFIED ||
            state == Escrow.EscrowState.SETTLEMENT_READY
        ) {
            vm.prank(escrow.settlementContract());
            escrow.refundObligation(obligationId);
        }
    }
}

contract EscrowInvariantTest is Test {
    AccessRegistry public access;
    Escrow public escrow;
    MockERC20 public token;
    EscrowHandler public handler;

    address public mockSettlement = address(0x5E771);

    function setUp() public {
        access = new AccessRegistry(address(this));
        token = new MockERC20("Settlement Token", "sINR");
        token.mint(address(0x111), 1_000_000);
        token.mint(address(0x222), 1_000_000);
        token.mint(address(0x333), 1_000_000);

        escrow = new Escrow(address(token), address(access));
        escrow.setSettlementContract(mockSettlement);

        handler = new EscrowHandler(escrow, token);

        targetContract(address(handler));
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 64
    function invariant_SumEqualsDeposited() public view {
        uint256 sumBalances = 0;
        uint256 actorLen = handler.actorCount();
        for (uint256 i = 0; i < actorLen; i++) {
            sumBalances += escrow.balances(handler.actors(i));
        }
        assertEq(sumBalances, escrow.totalDeposited());
    }

    function invariant_LockedLeBalance() public view {
        uint256 actorLen = handler.actorCount();
        for (uint256 i = 0; i < actorLen; i++) {
            address a = handler.actors(i);
            assertLe(escrow.lockedBalances(a), escrow.balances(a));
        }
    }

    function invariant_TokenBackedBySupply() public view {
        assertGe(token.balanceOf(address(escrow)), escrow.totalDeposited());
    }
}
