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

/**
 * @title DeployAmoy
 * @notice Deployment for VoltMesh on Polygon Amoy (80002), Sepolia (11155111), or Base Sepolia (84532).
 *         Everything is parameterised via environment variables — no keys or
 *         role addresses are hardcoded.
 *
 *   DEPLOYER_PRIVATE_KEY   (required) deployer / admin key
 *   REGULATOR_ADDRESS      (required) granted REGULATOR_ROLE
 *   OPERATOR_ADDRESS       (required) granted OPERATOR_ROLE
 *   AUDITOR_ADDRESS        (optional) granted AUDITOR_ROLE (defaults to regulator)
 *   ORACLE_ADDRESS         (required) granted ORACLE_ROLE
 *   SELLER_ADDRESS         (required) registered PROSUMER + minted vUSD
 *   BUYER_ADDRESS          (required) registered CONSUMER + minted vUSD
 *   BUYER_MINT_VUSD / SELLER_MINT_VUSD (optional, default 100000)
 *   SEED_EPOCH + ORACLE_PRIVATE_KEY (optional) submit one demo epoch
 *
 * Writes deployments/amoy.json and prints a ready-to-paste env-var list.
 */
contract DeployAmoy is Script {
    using MessageHashUtils for bytes32;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address regulator = vm.envAddress("REGULATOR_ADDRESS");
        address operator = vm.envAddress("OPERATOR_ADDRESS");
        address oracleSigner = vm.envAddress("ORACLE_ADDRESS");
        address auditor = vm.envOr("AUDITOR_ADDRESS", regulator);
        address seller = vm.envAddress("SELLER_ADDRESS");
        address buyer = vm.envAddress("BUYER_ADDRESS");
        uint256 buyerMint = vm.envOr("BUYER_MINT_VUSD", uint256(100_000)) * 1e18;
        uint256 sellerMint = vm.envOr("SELLER_MINT_VUSD", uint256(100_000)) * 1e18;

        require(
            block.chainid == 80002 || block.chainid == 11155111 || block.chainid == 84532,
            "DeployAmoy: target Amoy (80002), Sepolia (11155111) or Base Sepolia (84532)"
        );
        require(deployer != address(0), "deployer required");

        vm.startBroadcast(deployerKey);


        AccessRegistry access = new AccessRegistry(deployer);
        access.grantRole(access.REGISTRAR_ROLE(), deployer);
        // Distinct oversight roles on separate addresses (two-domain rule).
        access.grantRole(access.OPERATOR_ROLE(), operator);
        access.grantRole(access.REGULATOR_ROLE(), regulator);
        access.grantRole(access.AUDITOR_ROLE(), auditor);
        access.grantRole(access.ORACLE_ROLE(), oracleSigner);

        ParticipantRegistry participants = new ParticipantRegistry(address(access));
        DeviceRegistry devices = new DeviceRegistry(address(access));
        EpochOracle oracle = new EpochOracle(address(access), 1);
        MockERC20 token = new MockERC20("VoltMesh Settlement USD", "vUSD");
        Escrow escrow = new Escrow(address(token), address(access));
        BatchSettlement settlement = new BatchSettlement(
            address(access),
            address(participants),
            address(oracle),
            payable(address(escrow))
        );
        escrow.setSettlementContract(address(settlement));

        CertificateRegistry certs = new CertificateRegistry(
            address(access),
            address(oracle),
            address(devices),
            address(participants),
            "https://voltmesh.energy/api/cert/{id}.json"
        );
        RetirementRegistry retirement = new RetirementRegistry(address(access), address(certs));
        certs.setRetirementRegistry(address(retirement));

        // Register trading participants so the UI can resolve buyer/seller roles.
        participants.registerParticipant(
            buyer,
            keccak256(abi.encodePacked("participant-buyer-", buyer)),
            1,
            ParticipantRegistry.RoleType.CONSUMER,
            keccak256(abi.encodePacked("meter-buyer-", buyer))
        );
        participants.registerParticipant(
            seller,
            keccak256(abi.encodePacked("participant-seller-", seller)),
            1,
            ParticipantRegistry.RoleType.PROSUMER,
            keccak256(abi.encodePacked("meter-seller-", seller))
        );

        // Register a simulated solar meter for the seller (for certificate claims).
        bytes32 sellerDeviceId = keccak256(abi.encodePacked("meter-delhi-solar-", seller));
        devices.registerDevice(
            sellerDeviceId,
            seller,
            DeviceRegistry.SignerType.SIMULATED,
            DeviceRegistry.SourceType.SOLAR_PV,
            1,
            10000,
            100,
            keccak256(abi.encodePacked("participant-seller-", seller))
        );

        // Fund demo wallets with vUSD so they hold a real balance.
        token.mint(buyer, buyerMint);
        token.mint(seller, sellerMint);

        // Optionally seed one epoch so the UI's oracle reads have data.
        if (vm.envOr("SEED_EPOCH", false)) {
            uint256 oracleKey = vm.envUint("ORACLE_PRIVATE_KEY");
            uint32 intervalIdx = uint32(block.timestamp / 900);
            bytes32 root = keccak256(abi.encodePacked("voltmesh-seed-epoch", block.chainid, intervalIdx));
            bytes32 h = keccak256(
                abi.encodePacked(block.chainid, address(oracle), uint32(1), intervalIdx, root, uint32(1), uint64(1000))
            ).toEthSignedMessageHash();
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(oracleKey, h);
            bytes[] memory sigs = new bytes[](1);
            sigs[0] = abi.encodePacked(r, s, v);
            oracle.submitEpoch(1, intervalIdx, root, 1, 1000, sigs);
        }

        vm.stopBroadcast();

        // ---- Console output (source of truth) --------------------------------
        console.log("=== VoltMesh deployed on chain", block.chainid, "===");
        console.log("AccessRegistry:      ", address(access));
        console.log("ParticipantRegistry: ", address(participants));
        console.log("DeviceRegistry:      ", address(devices));
        console.log("EpochOracle:         ", address(oracle));
        console.log("MockERC20 (vUSD):    ", address(token));
        console.log("Escrow:              ", address(escrow));
        console.log("BatchSettlement:     ", address(settlement));
        console.log("CertificateRegistry: ", address(certs));
        console.log("RetirementRegistry:  ", address(retirement));
        console.log("");
        console.log("==== COPY INTO VERCEL (frontend) ====");
        console.log("VITE_CHAIN_ID=%s", vm.toString(block.chainid));
        console.log("VITE_RPC_URL=<your amoy rpc url>");
        console.log("VITE_API_URL=https://<your-railway-service>.up.railway.app");
        console.log("VITE_ACCESS_REGISTRY_ADDRESS=%s", vm.toString(address(access)));
        console.log("VITE_PARTICIPANT_REGISTRY_ADDRESS=%s", vm.toString(address(participants)));
        console.log("VITE_DEVICE_REGISTRY_ADDRESS=%s", vm.toString(address(devices)));
        console.log("VITE_EPOCH_ORACLE_ADDRESS=%s", vm.toString(address(oracle)));
        console.log("VITE_MOCK_ERC20_ADDRESS=%s", vm.toString(address(token)));
        console.log("VITE_ESCROW_ADDRESS=%s", vm.toString(address(escrow)));
        console.log("VITE_BATCH_SETTLEMENT_ADDRESS=%s", vm.toString(address(settlement)));
        console.log("VITE_CERTIFICATE_REGISTRY_ADDRESS=%s", vm.toString(address(certs)));
        console.log("VITE_RETIREMENT_REGISTRY_ADDRESS=%s", vm.toString(address(retirement)));
        console.log("");
        console.log("==== COPY INTO RAILWAY (backend) ====");
        console.log("CHAIN_ID=%s", vm.toString(block.chainid));
        console.log("RPC_URL=<your amoy rpc url>");
        console.log("ACCESS_REGISTRY_ADDRESS=%s", vm.toString(address(access)));
        console.log("PARTICIPANT_REGISTRY_ADDRESS=%s", vm.toString(address(participants)));
        console.log("EPOCH_ORACLE_ADDRESS=%s", vm.toString(address(oracle)));
        console.log("BATCH_SETTLEMENT_ADDRESS=%s", vm.toString(address(settlement)));
        console.log("MOCK_ERC20_ADDRESS=%s", vm.toString(address(token)));
        console.log("FRONTEND_ORIGIN=https://voltmesh-ivory.vercel.app");
        console.log("JWT_SECRET=<a random 32+ char secret>");
        console.log("FAUCET_PRIVATE_KEY=<key that owns vUSD mint>");

        // ---- Persist deployment JSON ------------------------------------------
        string memory json = "deployment";
        vm.serializeAddress(json, "AccessRegistry", address(access));
        vm.serializeAddress(json, "ParticipantRegistry", address(participants));
        vm.serializeAddress(json, "DeviceRegistry", address(devices));
        vm.serializeAddress(json, "EpochOracle", address(oracle));
        vm.serializeAddress(json, "MockERC20", address(token));
        vm.serializeAddress(json, "Escrow", address(escrow));
        vm.serializeAddress(json, "BatchSettlement", address(settlement));
        vm.serializeAddress(json, "CertificateRegistry", address(certs));
        vm.serializeAddress(json, "RetirementRegistry", address(retirement));
        string memory out = vm.serializeUint(json, "chainId", block.chainid);

        try vm.writeJson(out, "deployments/amoy.json") {
            console.log("");
            console.log("Deployment saved to deployments/amoy.json");
        } catch {
            console.log("");
            console.log("Warning: Could not write deployments/amoy.json (use console output above)");
        }
    }
}


