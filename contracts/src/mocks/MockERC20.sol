// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockERC20 (vUSD test settlement token)
 * @notice Test-only ERC-20. `mint` is owner-gated and the contract is only
 *         deployable on recognized testnets. Amoy (80002) and Base Sepolia (84532)
 *         are permitted so the demo can run against a real public testnet; mainnet is never allowed.
 */
contract MockERC20 is ERC20 {
    address public immutable owner;

    error Unauthorized();
    error ForbiddenNetwork();

    // 31337 Anvil, 11155111 Sepolia, 80002 Polygon Amoy, 84532 Base Sepolia
    function _isAllowedNetwork() internal view returns (bool) {
        return block.chainid == 31337 || block.chainid == 11155111 || block.chainid == 80002 || block.chainid == 84532;
    }

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        if (!_isAllowedNetwork()) revert ForbiddenNetwork();
        owner = msg.sender;
        _mint(msg.sender, 1_000_000_000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) external {
        if (!_isAllowedNetwork()) revert ForbiddenNetwork();
        if (msg.sender != owner) revert Unauthorized();
        _mint(to, amount);
    }
}

