// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    address public immutable owner;

    error Unauthorized();
    error ForbiddenNetwork();

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        if (block.chainid != 31337 && block.chainid != 11155111) revert ForbiddenNetwork();
        owner = msg.sender;
        _mint(msg.sender, 1_000_000_000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) external {
        if (block.chainid != 31337 && block.chainid != 11155111) revert ForbiddenNetwork();
        if (msg.sender != owner) revert Unauthorized();
        _mint(to, amount);
    }
}

