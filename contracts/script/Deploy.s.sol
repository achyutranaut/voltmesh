// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AccessRegistry.sol";
import "../src/ParticipantRegistry.sol";
import "../src/DeviceRegistry.sol";
import "../src/EpochOracle.sol";
import "../src/Escrow.sol";
import "../src/BatchSettlement.sol";
import "../src/CertificateRegistry.sol";
import "../src/RetirementRegistry.sol";
import "../src/mocks/MockERC20.sol";

contract DeployScript is Script {
    function run() external returns (
        address accessRegistry,
        address participantRegistry,
        address deviceRegistry,
        address epochOracle,
        address mockERC20,
        address escrow,
        address batchSettlement,
        address certificateRegistry,
        address retirementRegistry
    ) {
        require(
            block.chainid == 31337 || block.chainid == 11155111,
            "Deployments restricted strictly to testnets (Anvil 31337 or Sepolia 11155111)"
        );

        uint256 deployerPrivateKey;
        if (block.chainid != 31337) {
            // Revert immediately if PRIVATE_KEY is absent on non-local networks
            deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        } else {
            // Allow default Anvil account #0 strictly on local chain 31337
            deployerPrivateKey = vm.envOr(
                "PRIVATE_KEY",
                uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
            );
        }

        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deploying VoltMesh contracts on chainId:", block.chainid);
        console.log("Deployer address:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Access Registry
        AccessRegistry access = new AccessRegistry(deployer);
        accessRegistry = address(access);

        // Grant core operational roles directly to dedicated separate accounts
        access.grantRole(access.REGISTRAR_ROLE(), deployer);

        address discomOperator;
        address oracleSigner;
        address auditor;

        if (block.chainid == 31337) {
            // Anvil local testnet:
            // Account #3: DISCOM Market Operator
            discomOperator = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;
            // Dedicated Oracle Node (public devnet key 0x...0101)
            oracleSigner = 0x25A71a07cecf1753ee65b00E0a3AAEf7e0F51c0F;
            // Account #4: Regulator / Auditor
            auditor = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;
        } else {
            discomOperator = vm.envAddress("OPERATOR_ADDRESS");
            oracleSigner = vm.envAddress("ORACLE_ADDRESS");
            auditor = vm.envAddress("AUDITOR_ADDRESS");

            // Explicitly prevent using well-known Anvil test addresses on public testnets
            address anvil0 = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
            require(deployer != anvil0, "Cannot use default Anvil account #0 as deployer on public testnet");
            require(discomOperator != 0x90F79bf6EB2c4f870365E785982E1f101E93b906, "Cannot use default Anvil operator on public testnet");
            require(oracleSigner != 0x25A71a07cecf1753ee65b00E0a3AAEf7e0F51c0F, "Cannot use public devnet oracle key on public testnet");
            require(auditor != 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65, "Cannot use default Anvil auditor on public testnet");
        }

        access.grantRole(access.OPERATOR_ROLE(), discomOperator);
        access.grantRole(access.ORACLE_ROLE(), oracleSigner);
        access.grantRole(access.AUDITOR_ROLE(), auditor);

        // 2. Participant Registry
        ParticipantRegistry participants = new ParticipantRegistry(address(access));
        participantRegistry = address(participants);

        // 3. Device Registry
        DeviceRegistry devices = new DeviceRegistry(address(access));
        deviceRegistry = address(devices);

        // 4. Epoch Oracle (1-of-N threshold for dev/testnet)
        EpochOracle oracle = new EpochOracle(address(access), 1);
        epochOracle = address(oracle);

        // 5. Test Settlement Payment Token
        MockERC20 token = new MockERC20("VoltMesh Settlement USD", "vUSD");
        mockERC20 = address(token);

        // 6. Escrow Vault
        Escrow esc = new Escrow(address(token), address(access));
        escrow = address(esc);

        // 7. Batch Settlement
        BatchSettlement settlement = new BatchSettlement(
            address(access),
            address(participants),
            address(oracle),
            payable(address(esc))
        );
        batchSettlement = address(settlement);

        // 8. Link Escrow to BatchSettlement
        esc.setSettlementContract(address(settlement));

        // 9. Certificate Registry (ERC-1155)
        CertificateRegistry certs = new CertificateRegistry(
            address(access),
            address(oracle),
            address(devices),
            address(participants),
            "https://voltmesh.energy/api/cert/{id}.json"
        );
        certificateRegistry = address(certs);

        // 10. Retirement Registry
        RetirementRegistry ret = new RetirementRegistry(address(access), address(certs));
        retirementRegistry = address(ret);

        certs.setRetirementRegistry(address(ret));

        // Pre-register deployer as active participant (Prosumer in Zone 1)
        bytes32 deployerPartId = keccak256(abi.encodePacked("participant-deployer-", deployer));
        bytes32 deployerBinding = keccak256(abi.encodePacked("discom-meter-", deployer));
        participants.registerParticipant(
            deployer,
            deployerPartId,
            1,
            ParticipantRegistry.RoleType.PROSUMER,
            deployerBinding
        );

        // Register default simulated device for Zone 1
        bytes32 deviceId = keccak256("meter-delhi-solar-001");
        devices.registerDevice(
            deviceId,
            deployer,
            DeviceRegistry.SignerType.SIMULATED,
            DeviceRegistry.SourceType.SOLAR_PV,
            1,     // zoneId 1
            10000, // capacity 10 kWh
            100,   // trust weight 100%
            deployerPartId
        );

        // Fund deployer with initial vUSD tokens (1,000,000 vUSD = 1,000,000 * 10^18)
        token.mint(deployer, 1_000_000 * 10 ** token.decimals());

        // Fund settlement contract in Escrow for payout claims
        uint256 guaranteeFund = 100_000 * 10 ** token.decimals();
        token.mint(deployer, guaranteeFund);
        token.approve(address(settlement), guaranteeFund);
        settlement.fundSettlementPool(guaranteeFund);

        // Permanently lock direct grants so all future grants require timelock delay
        access.disableDirectGrants();

        vm.stopBroadcast();

        console.log("=== VoltMesh Deployment Completed ===");
        console.log("AccessRegistry:       ", accessRegistry);
        console.log("ParticipantRegistry:  ", participantRegistry);
        console.log("DeviceRegistry:       ", deviceRegistry);
        console.log("EpochOracle:          ", epochOracle);
        console.log("MockERC20 (vUSD):     ", mockERC20);
        console.log("Escrow:               ", escrow);
        console.log("BatchSettlement:      ", batchSettlement);
        console.log("CertificateRegistry:  ", certificateRegistry);
        console.log("RetirementRegistry:   ", retirementRegistry);
    }
}
