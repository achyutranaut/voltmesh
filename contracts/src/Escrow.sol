// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./AccessRegistry.sol";

/**
 * @title Escrow
 * @notice Holds settlement collateral and trading balances for participants.
 *         Ensures funds are locked during clearing and released/transferred during T+1 finality.
 */
contract Escrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable paymentToken;
    AccessRegistry public immutable accessRegistry;
    address public settlementContract;

    mapping(address => uint256) public balances;
    mapping(address => uint256) public lockedBalances;
    uint256 public totalDeposited;

    enum EscrowState {
        NONE,
        CREATED,
        FUNDED,
        LOCKED,
        DELIVERY_PENDING,
        DELIVERY_VERIFIED,
        SETTLEMENT_READY,
        SETTLED,
        REFUNDED
    }

    struct ObligationLock {
        bytes32 obligationId;
        address buyer;
        address seller;
        uint256 amount;
        uint32 zoneId;
        uint32 intervalIdx;
        EscrowState state;
        uint64 createdAt;
        uint64 deadline;
        uint64 settledAt;
    }

    mapping(bytes32 => ObligationLock) public obligationLocks;

    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event CollateralLocked(address indexed account, uint256 amount);
    event CollateralReleased(address indexed account, uint256 amount);
    event SettlementTransferred(address indexed from, address indexed to, uint256 amount);
    event SettlementContractUpdated(address newSettlementContract);
    event ObligationLocked(
        bytes32 indexed obligationId,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        uint32 zoneId,
        uint32 intervalIdx,
        uint64 deadline
    );
    event ObligationStateChanged(bytes32 indexed obligationId, EscrowState oldState, EscrowState newState);
    event ObligationSettled(bytes32 indexed obligationId, address indexed buyer, address indexed seller, uint256 amount);
    event ObligationRefunded(bytes32 indexed obligationId, address indexed buyer, uint256 amount);

    error CallerNotSettlement();
    error CallerNotAdmin();
    error InsufficientFreeBalance(uint256 requested, uint256 free);
    error InsufficientLockedBalance(uint256 requested, uint256 locked);
    error ObligationAlreadyExists(bytes32 obligationId);
    error ObligationNotFound(bytes32 obligationId);
    error InvalidObligationState(bytes32 obligationId, EscrowState current, EscrowState required);
    error InvalidObligationStateTransition(bytes32 obligationId, EscrowState current, EscrowState target);
    error InvalidDeadline(uint64 deadline, uint256 currentTime);
    error ObligationExpired(bytes32 obligationId, uint256 currentTime, uint64 deadline);
    error ObligationNotExpired(bytes32 obligationId, uint256 currentTime, uint64 deadline);
    error ObligationAlreadyTerminated(bytes32 obligationId, EscrowState current);
    error UnauthorizedClaimant();
    error InvalidParticipants();
    error InvalidAmount();
    error AlreadyInitialized();
    error SystemPaused();

    modifier onlySettlement() {
        if (msg.sender != settlementContract) revert CallerNotSettlement();
        _;
    }

    modifier whenNotPaused() {
        if (accessRegistry.paused()) revert SystemPaused();
        _;
    }

    constructor(address _paymentToken, address _accessRegistry) {
        paymentToken = IERC20(_paymentToken);
        accessRegistry = AccessRegistry(_accessRegistry);
    }

    function setSettlementContract(address _settlement) external {
        if (!accessRegistry.hasRole(accessRegistry.DEFAULT_ADMIN_ROLE(), msg.sender)) {
            revert CallerNotAdmin();
        }
        if (settlementContract != address(0)) {
            revert AlreadyInitialized();
        }
        settlementContract = _settlement;
        emit SettlementContractUpdated(_settlement);
    }

    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        balances[msg.sender] += amount;
        totalDeposited += amount;
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        uint256 free = balances[msg.sender] - lockedBalances[msg.sender];
        if (amount > free) revert InsufficientFreeBalance(amount, free);

        balances[msg.sender] -= amount;
        totalDeposited -= amount;
        paymentToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function lockCollateral(address account, uint256 amount) external onlySettlement whenNotPaused {
        uint256 free = balances[account] - lockedBalances[account];
        if (amount > free) revert InsufficientFreeBalance(amount, free);

        lockedBalances[account] += amount;
        emit CollateralLocked(account, amount);
    }

    function releaseCollateral(address account, uint256 amount) external onlySettlement {
        if (amount > lockedBalances[account]) {
            revert InsufficientLockedBalance(amount, lockedBalances[account]);
        }
        lockedBalances[account] -= amount;
        emit CollateralReleased(account, amount);
    }

    /**
     * @notice Locks collateral for a cleared bilateral delivery obligation with an explicit deadline.
     */
    function lockObligationCollateral(
        bytes32 obligationId,
        address buyer,
        address seller,
        uint256 amount,
        uint32 zoneId,
        uint32 intervalIdx,
        uint64 deadline
    ) external onlySettlement whenNotPaused {
        if (obligationLocks[obligationId].state != EscrowState.NONE) {
            revert ObligationAlreadyExists(obligationId);
        }
        if (buyer == address(0) || seller == address(0) || buyer == seller) {
            revert InvalidParticipants();
        }
        if (amount == 0) revert InvalidAmount();
        if (deadline <= block.timestamp) {
            revert InvalidDeadline(deadline, block.timestamp);
        }

        uint256 free = balances[buyer] - lockedBalances[buyer];
        if (amount > free) revert InsufficientFreeBalance(amount, free);

        lockedBalances[buyer] += amount;

        obligationLocks[obligationId] = ObligationLock({
            obligationId: obligationId,
            buyer: buyer,
            seller: seller,
            amount: amount,
            zoneId: zoneId,
            intervalIdx: intervalIdx,
            state: EscrowState.LOCKED,
            createdAt: uint64(block.timestamp),
            deadline: deadline,
            settledAt: 0
        });

        emit CollateralLocked(buyer, amount);
        emit ObligationLocked(obligationId, buyer, seller, amount, zoneId, intervalIdx, deadline);
        emit ObligationStateChanged(obligationId, EscrowState.NONE, EscrowState.LOCKED);
    }

    /**
     * @notice Validates whether a state transition adheres to the formal obligation lifecycle graph.
     */
    function isValidTransition(EscrowState from, EscrowState to) public pure returns (bool) {
        if (from == EscrowState.LOCKED) {
            return to == EscrowState.DELIVERY_VERIFIED ||
                   to == EscrowState.REFUNDED;
        }
        if (from == EscrowState.DELIVERY_VERIFIED) {
            return to == EscrowState.SETTLEMENT_READY ||
                   to == EscrowState.REFUNDED;
        }
        if (from == EscrowState.SETTLEMENT_READY) {
            return to == EscrowState.SETTLED ||
                   to == EscrowState.REFUNDED;
        }
        // NONE, SETTLED, and REFUNDED are strictly terminal states
        return false;
    }

    function updateObligationState(bytes32 obligationId, EscrowState newState) external onlySettlement whenNotPaused {
        ObligationLock storage obl = obligationLocks[obligationId];
        if (obl.state == EscrowState.NONE) revert ObligationNotFound(obligationId);

        EscrowState oldState = obl.state;
        if (!isValidTransition(oldState, newState)) {
            revert InvalidObligationStateTransition(obligationId, oldState, newState);
        }

        obl.state = newState;
        emit ObligationStateChanged(obligationId, oldState, newState);
    }

    function settleObligation(bytes32 obligationId, uint256 settleAmount) external onlySettlement nonReentrant whenNotPaused {
        ObligationLock storage obl = obligationLocks[obligationId];
        if (obl.state == EscrowState.NONE) revert ObligationNotFound(obligationId);
        if (!isValidTransition(obl.state, EscrowState.SETTLED)) {
            revert InvalidObligationState(obligationId, obl.state, EscrowState.SETTLEMENT_READY);
        }
        if (block.timestamp > obl.deadline) {
            revert ObligationExpired(obligationId, block.timestamp, obl.deadline);
        }
        if (settleAmount > obl.amount) revert InvalidAmount();

        address buyer = obl.buyer;
        address seller = obl.seller;
        uint256 totalLocked = obl.amount;

        // Strict unreserved release: no silent clamping
        if (totalLocked > lockedBalances[buyer]) {
            revert InsufficientLockedBalance(totalLocked, lockedBalances[buyer]);
        }
        lockedBalances[buyer] -= totalLocked;

        if (settleAmount > balances[buyer]) {
            revert InsufficientFreeBalance(settleAmount, balances[buyer]);
        }

        // Transfer delivered value to seller
        balances[buyer] -= settleAmount;
        balances[seller] += settleAmount;

        // Any leftover from original locked amount remains with buyer as unreserved free balance
        obl.state = EscrowState.SETTLED;
        obl.settledAt = uint64(block.timestamp);

        emit SettlementTransferred(buyer, seller, settleAmount);
        emit ObligationSettled(obligationId, buyer, seller, settleAmount);
        emit ObligationStateChanged(obligationId, EscrowState.LOCKED, EscrowState.SETTLED);
    }

    function refundObligation(bytes32 obligationId) external onlySettlement nonReentrant {
        ObligationLock storage obl = obligationLocks[obligationId];
        if (obl.state == EscrowState.NONE) revert ObligationNotFound(obligationId);
        if (obl.state == EscrowState.SETTLED || obl.state == EscrowState.REFUNDED) {
            revert InvalidObligationState(obligationId, obl.state, EscrowState.LOCKED);
        }

        address buyer = obl.buyer;
        uint256 amount = obl.amount;

        // Strict unreserved release: no silent clamping
        if (amount > lockedBalances[buyer]) {
            revert InsufficientLockedBalance(amount, lockedBalances[buyer]);
        }
        lockedBalances[buyer] -= amount;

        obl.state = EscrowState.REFUNDED;
        obl.settledAt = uint64(block.timestamp);

        emit CollateralReleased(buyer, amount);
        emit ObligationRefunded(obligationId, buyer, amount);
        emit ObligationStateChanged(obligationId, EscrowState.LOCKED, EscrowState.REFUNDED);
    }

    /**
     * @notice Allows a buyer (or operator) to reclaim locked collateral after the obligation deadline expires.
     */
    function claimExpiredRefund(bytes32 obligationId) external nonReentrant whenNotPaused {
        ObligationLock storage obl = obligationLocks[obligationId];
        if (obl.state == EscrowState.NONE) revert ObligationNotFound(obligationId);
        if (obl.state == EscrowState.SETTLED || obl.state == EscrowState.REFUNDED) {
            revert ObligationAlreadyTerminated(obligationId, obl.state);
        }
        if (block.timestamp <= obl.deadline) {
            revert ObligationNotExpired(obligationId, block.timestamp, obl.deadline);
        }
        if (msg.sender != obl.buyer && !accessRegistry.hasRole(accessRegistry.OPERATOR_ROLE(), msg.sender)) {
            revert UnauthorizedClaimant();
        }

        address buyer = obl.buyer;
        uint256 amount = obl.amount;

        if (amount > lockedBalances[buyer]) {
            revert InsufficientLockedBalance(amount, lockedBalances[buyer]);
        }
        lockedBalances[buyer] -= amount;

        obl.state = EscrowState.REFUNDED;
        obl.settledAt = uint64(block.timestamp);

        emit CollateralReleased(buyer, amount);
        emit ObligationRefunded(obligationId, buyer, amount);
        emit ObligationStateChanged(obligationId, EscrowState.LOCKED, EscrowState.REFUNDED);
    }

    function executeSettlementTransfer(
        address from,
        address to,
        uint256 amount
    ) external onlySettlement nonReentrant {
        if (from == address(0) || to == address(0) || from == to) {
            revert InvalidParticipants();
        }
        uint256 free = balances[from] - lockedBalances[from];
        if (amount > free) {
            revert InsufficientFreeBalance(amount, free);
        }

        balances[from] -= amount;
        balances[to] += amount;

        emit SettlementTransferred(from, to, amount);
    }

    function getFreeBalance(address account) external view returns (uint256) {
        return balances[account] - lockedBalances[account];
    }

    /// @dev Reject direct native ETH deposits to prevent loss of funds
    receive() external payable {
        revert("Native ETH transfers not supported; use ERC-20 deposit");
    }

    fallback() external payable {
        revert("Native ETH transfers not supported");
    }
}
