// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
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
    using MessageHashUtils for bytes32;

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
            block.chainid == 31337,
            "Dual oversight roles can only be granted on devnet (chainid 31337)"
        );

        uint256 deployerPrivateKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deploying VoltMesh contracts on chainId:", block.chainid);
        console.log("Deployer address (Account #0):", deployer);

        // Standard Anvil default dev accounts:
        // Account 0: deployer (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)
        // Account 1: regulator (0x70997970C51812dc3A010C7d01b50e0d17dc79C8)
        // Account 2: operator (0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC)
        // Account 3: oracle (0x90F79bf6EB2c4f870365E785982E1f101E93b906)
        // Account 4: seller (0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65)
        // Account 5: buyer (0x9965507D1a55bcC2695C58ba16FB37d819B0A4df)
        address regulator = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        address operator = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
        address oracleSigner = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;
        uint256 oraclePrivateKey = 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6;
        address seller = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;
        address buyer = 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc;

        address oversightAccount = vm.envOr(
            "AUDITOR_ADDRESS",
            address(0x13e21cccB6fcB1E03105b6243Af4563280E56FDd)
        );

        vm.startBroadcast(deployerPrivateKey);

        // 1. Access Registry
        AccessRegistry access = new AccessRegistry(deployer);
        accessRegistry = address(access);

        // Grant core operational roles directly to dedicated separate accounts
        access.grantRole(access.REGISTRAR_ROLE(), deployer);

        // Roles mapping:
        // Account 1: REGULATOR_ROLE and AUDITOR_ROLE
        access.grantRole(access.REGULATOR_ROLE(), regulator);
        access.grantRole(access.AUDITOR_ROLE(), regulator);

        // Account 2: OPERATOR_ROLE
        access.grantRole(access.OPERATOR_ROLE(), operator);

        // Account 3: ORACLE_ROLE
        access.grantRole(access.ORACLE_ROLE(), oracleSigner);

        // Dedicated Oversight account (devnet testing)
        access.grantRole(access.REGULATOR_ROLE(), oversightAccount);
        access.grantRole(access.OPERATOR_ROLE(), oversightAccount);
        access.grantRole(access.AUDITOR_ROLE(), oversightAccount);

        // Mark preset demo test accounts as isDemo = true
        access.setDemoDomain(buyer, true);
        access.setDemoDomain(seller, true);
        access.setDemoDomain(operator, true);
        access.setDemoDomain(regulator, true);
        access.setDemoDomain(oracleSigner, true);
        access.setDemoDomain(oversightAccount, true);

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

        // Pre-register buyer as CONSUMER
        bytes32 buyerPartId = keccak256(abi.encodePacked("participant-buyer-", buyer));
        participants.registerParticipant(
            buyer,
            buyerPartId,
            1,
            ParticipantRegistry.RoleType.CONSUMER,
            keccak256(abi.encodePacked("meter-buyer-", buyer))
        );

        // Pre-register seller as PROSUMER
        bytes32 sellerPartId = keccak256(abi.encodePacked("participant-seller-", seller));
        participants.registerParticipant(
            seller,
            sellerPartId,
            1,
            ParticipantRegistry.RoleType.PROSUMER,
            keccak256(abi.encodePacked("meter-seller-", seller))
        );

        // Register simulated solar meter for seller (10 kWh capacity, solar PV)
        bytes32 sellerDeviceId = keccak256(abi.encodePacked("meter-delhi-solar-", seller));
        devices.registerDevice(
            sellerDeviceId,
            seller,
            DeviceRegistry.SignerType.SIMULATED,
            DeviceRegistry.SourceType.SOLAR_PV,
            1,     // zoneId 1
            10000, // capacity 10 kWh
            100,   // trust weight 100%
            sellerPartId
        );

        // Also register deployer for legacy dev script compatibility
        bytes32 deployerPartId = keccak256(abi.encodePacked("participant-deployer-", deployer));
        participants.registerParticipant(
            deployer,
            deployerPartId,
            1,
            ParticipantRegistry.RoleType.PROSUMER,
            keccak256(abi.encodePacked("meter-deployer-", deployer))
        );
        devices.registerDevice(
            keccak256("meter-delhi-solar-001"),
            deployer,
            DeviceRegistry.SignerType.SIMULATED,
            DeviceRegistry.SourceType.SOLAR_PV,
            1,
            10000,
            100,
            deployerPartId
        );

        // Mint vUSD tokens to Buyer and Seller (100,000 vUSD each)
        uint256 participantMint = 100_000 * 10 ** token.decimals();
        token.mint(buyer, participantMint);
        token.mint(seller, participantMint);

        // Fund deployer with initial vUSD tokens
        token.mint(deployer, 1_000_000 * 10 ** token.decimals());

        // Fund settlement contract in Escrow for payout claims
        uint256 guaranteeFund = 100_000 * 10 ** token.decimals();
        token.mint(deployer, guaranteeFund);
        token.approve(address(settlement), guaranteeFund);
        settlement.fundSettlementPool(guaranteeFund);

        // Seed initial epoch for current 15-minute interval
        uint32 intervalIdx = uint32(block.timestamp / 900);
        bytes32 root = keccak256(abi.encodePacked("voltmesh-seed-epoch", block.chainid, intervalIdx));
        bytes32 h = keccak256(
            abi.encodePacked(block.chainid, address(oracle), uint32(1), intervalIdx, root, uint32(1), uint64(1000))
        ).toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oraclePrivateKey, h);
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = abi.encodePacked(r, s, v);
        oracle.submitEpoch(1, intervalIdx, root, 1, 1000, sigs);

        // Permanently lock direct grants so all future grants require timelock delay
        access.disableDirectGrants();

        vm.stopBroadcast();

        console.log("=== VoltMesh Local Devnet Deployment Completed ===");
        console.log("AccessRegistry:       ", accessRegistry);
        console.log("ParticipantRegistry:  ", participantRegistry);
        console.log("DeviceRegistry:       ", deviceRegistry);
        console.log("EpochOracle:          ", epochOracle);
        console.log("MockERC20 (vUSD):     ", mockERC20);
        console.log("Escrow:               ", escrow);
        console.log("BatchSettlement:      ", batchSettlement);
        console.log("CertificateRegistry:  ", certificateRegistry);
        console.log("RetirementRegistry:   ", retirementRegistry);

        // Persist local deployment JSON
        string memory json = "localDeployment";
        vm.serializeAddress(json, "AccessRegistry", accessRegistry);
        vm.serializeAddress(json, "ParticipantRegistry", participantRegistry);
        vm.serializeAddress(json, "DeviceRegistry", deviceRegistry);
        vm.serializeAddress(json, "EpochOracle", epochOracle);
        vm.serializeAddress(json, "MockERC20", mockERC20);
        vm.serializeAddress(json, "Escrow", escrow);
        vm.serializeAddress(json, "BatchSettlement", batchSettlement);
        vm.serializeAddress(json, "CertificateRegistry", certificateRegistry);
        vm.serializeAddress(json, "RetirementRegistry", retirementRegistry);
        string memory out = vm.serializeUint(json, "chainId", block.chainid);

        try vm.writeJson(out, "deployments/local.json") {
            console.log("Deployment saved to deployments/local.json");
        } catch {
            console.log("Warning: Could not write deployments/local.json");
        }
    }
}
