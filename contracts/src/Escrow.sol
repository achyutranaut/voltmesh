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

    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event CollateralLocked(address indexed account, uint256 amount);
    event CollateralReleased(address indexed account, uint256 amount);
    event SettlementTransferred(address indexed from, address indexed to, uint256 amount);
    event SettlementContractUpdated(address newSettlementContract);

    error CallerNotSettlement();
    error CallerNotAdmin();
    error InsufficientFreeBalance(uint256 requested, uint256 free);
    error InsufficientLockedBalance(uint256 requested, uint256 locked);
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

    function executeSettlementTransfer(
        address from,
        address to,
        uint256 amount
    ) external onlySettlement nonReentrant {
        if (amount > balances[from]) {
            revert InsufficientFreeBalance(amount, balances[from]);
        }

        // Release locked portion if locked
        if (lockedBalances[from] >= amount) {
            lockedBalances[from] -= amount;
        } else {
            lockedBalances[from] = 0;
        }

        balances[from] -= amount;
        balances[to] += amount;

        emit SettlementTransferred(from, to, amount);
    }

    function getFreeBalance(address account) external view returns (uint256) {
        return balances[account] - lockedBalances[account];
    }
}
