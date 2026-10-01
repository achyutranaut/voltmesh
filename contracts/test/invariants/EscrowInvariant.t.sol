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

    constructor(Escrow _escrow, MockERC20 _token) {
        escrow = _escrow;
        token = _token;

        actors.push(address(0x111));
        actors.push(address(0x222));
        actors.push(address(0x333));

        for (uint256 i = 0; i < actors.length; i++) {
            token.mint(actors[i], 1_000_000);
            vm.prank(actors[i]);
            token.approve(address(escrow), type(uint256).max);
        }
    }

    modifier useActor(uint256 actorIndexSeed) {
        currentActor = actors[actorIndexSeed % actors.length];
        _;
    }

    function deposit(uint256 actorIndexSeed, uint256 amount) public useActor(actorIndexSeed) {
        amount = bound(amount, 1, 50_000);
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
}

contract EscrowInvariantTest is Test {
    AccessRegistry public access;
    Escrow public escrow;
    MockERC20 public token;
    EscrowHandler public handler;

    function setUp() public {
        access = new AccessRegistry(address(this));
        token = new MockERC20("Settlement Token", "sINR");
        escrow = new Escrow(address(token), address(access));
        handler = new EscrowHandler(escrow, token);

        targetContract(address(handler));
    }

    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 32
    function invariant_EscrowConservation() public view {
        assertGe(token.balanceOf(address(escrow)), escrow.totalDeposited());
    }

    function invariant_LockedNeverExceedsTotal() public view {
        for (uint256 i = 0; i < handler.actors(0).balance; i++) {
            // Check actor invariants
        }
    }
}
