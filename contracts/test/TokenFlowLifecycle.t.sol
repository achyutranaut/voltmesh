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

/**
 * @title TokenFlowLifecycleTest
 * @notice Asserts EXACT on-chain vUSD balance deltas across the full
 *         buyer -> escrow -> seller flow so regressions in token movement are caught.
 *
 *   Flow under test (the real VoltMesh model):
 *     1. Buyer approves + deposits vUSD into Escrow  (wallet vUSD down, escrow internal up)
 *     2. Operator locks a bilateral obligation        (buyer free escrow down, locked up)
 *     3. Operator settles the obligation              (seller escrow internal up)
 *     4. Seller withdraws vUSD to their wallet        (escrow internal down, seller wallet up)
 *     5. Refund path returns locked funds to buyer    (locked -> free, then withdrawn)
 *
 *   Note: VoltMesh matches orders OFF-CHAIN (EIP-712) and moves real ERC-20 only
 *   at deposit/withdraw; obligation value moves within the Escrow ledger. This is
 *   the actual on-chain vUSD movement for real wallets.
 */
contract TokenFlowLifecycleTest is Test {
    using MessageHashUtils for bytes32;

    AccessRegistry access;
    ParticipantRegistry participants;
    DeviceRegistry devices;
    EpochOracle oracle;
    Escrow escrow;
    BatchSettlement settlement;
    MockERC20 token;

    address admin = address(0xAD);
    address operator = address(0x09);
    address regulator = address(0x0E6);

    uint256 buyerKey = 0xB0B;
    uint256 sellerKey = 0x5E1;
    address buyer;
    address seller;

    function setUp() public {
        buyer = vm.addr(buyerKey);
        seller = vm.addr(sellerKey);

        vm.startPrank(admin);
        access = new AccessRegistry(admin);
        access.grantRole(access.OPERATOR_ROLE(), operator);
        access.grantRole(access.REGULATOR_ROLE(), regulator);
        access.grantRole(access.REGISTRAR_ROLE(), admin);

        participants = new ParticipantRegistry(address(access));
        devices = new DeviceRegistry(address(access));
        oracle = new EpochOracle(address(access), 1);
        token = new MockERC20("VoltMesh Settlement USD", "vUSD");
        escrow = new Escrow(address(token), address(access));
        settlement = new BatchSettlement(address(access), address(participants), address(oracle), payable(address(escrow)));
        escrow.setSettlementContract(address(settlement));

        participants.registerParticipant(buyer, keccak256("p-buyer"), 1, ParticipantRegistry.RoleType.CONSUMER, keccak256("b-buyer"));
        participants.registerParticipant(seller, keccak256("p-seller"), 1, ParticipantRegistry.RoleType.PROSUMER, keccak256("b-seller"));

        token.transfer(buyer, 100_000);
        token.transfer(seller, 10_000);
        vm.stopPrank();
    }

    function _lockObligation(bytes32 id, uint256 amount, uint64 deadline) internal {
        bytes32 h = settlement.hashObligation(id, buyer, seller, amount, 1, 48, deadline);
        (uint8 bv, bytes32 br, bytes32 bs) = vm.sign(buyerKey, h);
        (uint8 sv, bytes32 sr, bytes32 ss) = vm.sign(sellerKey, h);
        vm.prank(operator);
        settlement.lockObligation(id, buyer, seller, amount, 1, 48, deadline, abi.encodePacked(br, bs, bv), abi.encodePacked(sr, ss, sv));
    }

    // 1. Deposit moves real ERC-20 from buyer wallet into the Escrow contract.
    function test_Deposit_MovesRealTokens() public {
        uint256 amount = 50_000;
        uint256 buyerWalletBefore = token.balanceOf(buyer);
        uint256 escrowVaultBefore = token.balanceOf(address(escrow));

        vm.startPrank(buyer);
        token.approve(address(escrow), amount);
        escrow.deposit(amount);
        vm.stopPrank();

        assertEq(token.balanceOf(buyer), buyerWalletBefore - amount, "buyer wallet vUSD must drop by deposit");
        assertEq(token.balanceOf(address(escrow)), escrowVaultBefore + amount, "escrow vault must gain deposit");
        assertEq(escrow.balances(buyer), amount, "escrow internal ledger must credit buyer");
        assertEq(escrow.getFreeBalance(buyer), amount, "deposit is free until locked");
    }

    // 2-4. Full settle path: seller ends up with real wallet vUSD, escrow net-zero for seller.
    function test_FullFlow_SettlementPaysSellerRealTokens() public {
        uint256 deposit = 50_000;
        uint256 locked = 40_000;
        uint256 settled = 35_000; // buyer refunded the 5,000 difference

        vm.startPrank(buyer);
        token.approve(address(escrow), deposit);
        escrow.deposit(deposit);
        vm.stopPrank();

        bytes32 id = keccak256("obl-1");
        uint64 deadline = uint64(block.timestamp + 1 days);
        _lockObligation(id, locked, deadline);

        assertEq(escrow.getFreeBalance(buyer), deposit - locked, "free balance drops by locked amount");
        assertEq(escrow.lockedBalances(buyer), locked, "locked balance rises");

        // Operator advances state LOCKED -> DELIVERY_VERIFIED -> SETTLEMENT_READY -> SETTLED
        vm.startPrank(operator);
        settlement.updateObligationState(id, Escrow.EscrowState.DELIVERY_VERIFIED);
        settlement.updateObligationState(id, Escrow.EscrowState.SETTLEMENT_READY);
        settlement.settleObligation(id, settled);
        vm.stopPrank();

        assertEq(escrow.lockedBalances(buyer), 0, "all locked collateral released on settle");
        assertEq(escrow.balances(buyer), deposit - settled, "buyer escrow balance = deposit - settled (refund retained)");
        assertEq(escrow.balances(seller), settled, "seller escrow ledger credited with settled amount");

        // Seller withdraws real ERC-20 to their wallet.
        uint256 sellerWalletBefore = token.balanceOf(seller);
        vm.prank(seller);
        escrow.withdraw(settled);
        assertEq(token.balanceOf(seller), sellerWalletBefore + settled, "seller wallet vUSD increases by settled amount");
        assertEq(escrow.balances(seller), 0, "seller escrow ledger drained after withdraw");

        // Conservation: escrow holds exactly buyer's retained refund; nothing lost.
        assertEq(token.balanceOf(address(escrow)), escrow.balances(buyer), "escrow vault == remaining buyer ledger");
    }

    // 3. Cancel / refund path returns locked funds to the buyer in full.
    function test_Refund_ReturnsLockedFundsInFull() public {
        uint256 deposit = 30_000;
        uint256 locked = 30_000;

        vm.startPrank(buyer);
        token.approve(address(escrow), deposit);
        escrow.deposit(deposit);
        vm.stopPrank();

        bytes32 id = keccak256("obl-refund");
        uint64 deadline = uint64(block.timestamp + 1 days);
        _lockObligation(id, locked, deadline);

        vm.prank(operator);
        settlement.refundObligation(id);

        assertEq(escrow.lockedBalances(buyer), 0, "locked funds released on refund");
        assertEq(escrow.getFreeBalance(buyer), deposit, "buyer free balance restored in full");
        assertEq(escrow.balances(seller), 0, "seller receives nothing on refund");

        uint256 buyerWalletBefore = token.balanceOf(buyer);
        vm.prank(buyer);
        escrow.withdraw(deposit);
        assertEq(token.balanceOf(buyer), buyerWalletBefore + deposit, "buyer wallet restored in full");
    }

    // 4. A non-operator is rejected from operator-only settlement functions.
    function test_NonOperator_RejectedFromSettlement() public {
        uint256 deposit = 20_000;
        vm.startPrank(buyer);
        token.approve(address(escrow), deposit);
        escrow.deposit(deposit);
        vm.stopPrank();

        bytes32 id = keccak256("obl-auth");
        uint64 deadline = uint64(block.timestamp + 1 days);
        _lockObligation(id, deposit, deadline);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(BatchSettlement.CallerNotOperator.selector));
        settlement.settleObligation(id, deposit);

        vm.prank(regulator);
        vm.expectRevert(abi.encodeWithSelector(BatchSettlement.CallerNotOperator.selector));
        settlement.settleObligation(id, deposit);
    }
}

