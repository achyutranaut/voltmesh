// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/mocks/MockERC20.sol";
import "../script/DeployAmoy.s.sol";

contract MockERC20Test is Test {
    function test_Deploy_BaseSepolia_Accepted() public {
        vm.chainId(84532);
        MockERC20 token = new MockERC20("VoltMesh Settlement USD", "vUSD");
        assertEq(token.name(), "VoltMesh Settlement USD");
        assertEq(token.symbol(), "vUSD");
        assertEq(token.decimals(), 18);
        assertEq(token.owner(), address(this));
    }

    function test_Deploy_PolygonAmoy_Accepted() public {
        vm.chainId(80002);
        MockERC20 token = new MockERC20("VoltMesh Settlement USD", "vUSD");
        assertEq(token.owner(), address(this));
    }

    function test_Deploy_EthereumSepolia_Accepted() public {
        vm.chainId(11155111);
        MockERC20 token = new MockERC20("VoltMesh Settlement USD", "vUSD");
        assertEq(token.owner(), address(this));
    }

    function test_Deploy_Anvil_Accepted() public {
        vm.chainId(31337);
        MockERC20 token = new MockERC20("VoltMesh Settlement USD", "vUSD");
        assertEq(token.owner(), address(this));
    }

    function test_Deploy_EthereumMainnet_RevertsForbiddenNetwork() public {
        vm.chainId(1);
        vm.expectRevert(MockERC20.ForbiddenNetwork.selector);
        new MockERC20("VoltMesh Settlement USD", "vUSD");
    }

    function test_Deploy_BaseMainnet_RevertsForbiddenNetwork() public {
        vm.chainId(8453);
        vm.expectRevert(MockERC20.ForbiddenNetwork.selector);
        new MockERC20("VoltMesh Settlement USD", "vUSD");
    }

    function test_Mint_BaseSepolia_Accepted() public {
        vm.chainId(84532);
        MockERC20 token = new MockERC20("VoltMesh Settlement USD", "vUSD");
        address recipient = address(0x1234);
        token.mint(recipient, 500);
        assertEq(token.balanceOf(recipient), 500);
    }

    function test_Mint_ForbiddenNetwork_Reverts() public {
        vm.chainId(84532);
        MockERC20 token = new MockERC20("VoltMesh Settlement USD", "vUSD");

        vm.chainId(1);
        vm.expectRevert(MockERC20.ForbiddenNetwork.selector);
        token.mint(address(0x1234), 500);

        vm.chainId(8453);
        vm.expectRevert(MockERC20.ForbiddenNetwork.selector);
        token.mint(address(0x1234), 500);
    }
}

contract DeployAmoyScriptGuardTest is Test {
    DeployAmoy script;

    function setUp() public {
        script = new DeployAmoy();
        vm.setEnv("DEPLOYER_PRIVATE_KEY", "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
        vm.setEnv("REGULATOR_ADDRESS", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
        vm.setEnv("OPERATOR_ADDRESS", "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");
        vm.setEnv("ORACLE_ADDRESS", "0x90F79bf6EB2c4f870365E785982E1f101E93b906");
        vm.setEnv("SELLER_ADDRESS", "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65");
        vm.setEnv("BUYER_ADDRESS", "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc");
    }

    function test_DeployAmoyScript_RejectsEthereumMainnet() public {
        vm.chainId(1);
        vm.expectRevert("DeployAmoy: target Amoy (80002), Sepolia (11155111) or Base Sepolia (84532)");
        script.run();
    }

    function test_DeployAmoyScript_RejectsBaseMainnet() public {
        vm.chainId(8453);
        vm.expectRevert("DeployAmoy: target Amoy (80002), Sepolia (11155111) or Base Sepolia (84532)");
        script.run();
    }

    function test_DeployAmoyScript_AcceptsBaseSepoliaChainGuard() public {
        vm.chainId(84532);
        // Script will pass line 50 chain guard and proceed to run.
        // It should not revert with the chain guard error message.
        script.run();
    }
}
