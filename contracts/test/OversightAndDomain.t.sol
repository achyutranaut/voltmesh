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
import "../src/CertificateRegistry.sol";
import "../src/mocks/MockERC20.sol";
import "../script/Deploy.s.sol";

contract OversightAndDomainTest is Test {
    using MessageHashUtils for bytes32;

    AccessRegistry public access;
    ParticipantRegistry public participants;
    DeviceRegistry public devices;
    EpochOracle public oracle;
    Escrow public escrow;
    BatchSettlement public settlement;
    CertificateRegistry public certificates;
    MockERC20 public token;

    address public admin = address(0xAD);
    address public oversight = address(0x13e21cccB6fcB1E03105b6243Af4563280E56FDd);
    
    uint256 public buyerKey = 0x111;
    address public buyer;
    uint256 public sellerKey = 0x222;
    address public seller;
    uint256 public liveSellerKey = 0x333;
    address public liveSeller;

    uint256 public oracleKey = 0x444;
    address public oracleAddr;

    bytes32 public zone1 = keccak256("ZONE-1");

    function setUp() public {
        buyer = vm.addr(buyerKey);
        seller = vm.addr(sellerKey);
        liveSeller = vm.addr(liveSellerKey);
        oracleAddr = vm.addr(oracleKey);

        vm.startPrank(admin);
        access = new AccessRegistry(admin);
        access.grantRole(access.REGISTRAR_ROLE(), admin);
        access.grantRole(access.ORACLE_ROLE(), oracleAddr);

        // Grant oversight roles to oversight account
        access.grantRole(access.REGULATOR_ROLE(), oversight);
        access.grantRole(access.OPERATOR_ROLE(), oversight);

        participants = new ParticipantRegistry(address(access));
        devices = new DeviceRegistry(address(access));
        oracle = new EpochOracle(address(access), 1);

        token = new MockERC20("Settlement Rupee", "sINR");
        escrow = new Escrow(address(token), address(access));

        settlement = new BatchSettlement(
            address(access),
            address(participants),
            address(oracle),
            payable(address(escrow))
        );
        escrow.setSettlementContract(address(settlement));

        certificates = new CertificateRegistry(
            address(access),
            address(oracle),
            address(devices),
            address(participants),
            "https://api.voltmesh.network/certs/{id}.json"
        );

        // Mark demo participants
        access.setDemoDomain(buyer, true);
        access.setDemoDomain(seller, true);
        access.setDemoDomain(oversight, true);
        // liveSeller remains isDemo = false (LIVE)

        // Register participants
        participants.registerParticipant(
            buyer,
            keccak256("part-buyer"),
            1,
            ParticipantRegistry.RoleType.CONSUMER,
            keccak256("discom-buyer")
        );
        participants.registerParticipant(
            seller,
            keccak256("part-seller"),
            1,
            ParticipantRegistry.RoleType.PROSUMER,
            keccak256("discom-seller")
        );
        participants.registerParticipant(
            liveSeller,
            keccak256("part-live-seller"),
            1,
            ParticipantRegistry.RoleType.PROSUMER,
            keccak256("discom-live-seller")
        );

        // Register meter device bound to seller
        devices.registerDevice(
            keccak256("dev-seller"),
            seller,
            DeviceRegistry.SignerType.DEVICE_SE,
            DeviceRegistry.SourceType.SOLAR_PV,
            1,
            5000,
            100,
            keccak256("part-seller")
        );

        // Mint token funds
        token.mint(buyer, 1_000_000 ether);
        token.mint(seller, 1_000_000 ether);
        token.mint(oversight, 1_000_000 ether);

        vm.stopPrank();

        vm.prank(buyer);
        token.approve(address(escrow), type(uint256).max);
        vm.prank(seller);
        token.approve(address(escrow), type(uint256).max);
        vm.prank(oversight);
        token.approve(address(escrow), type(uint256).max);
    }

    // ==========================================
    // PHASE 2 & 8: OVERSIGHT TRADING BLOCK TESTS
    // ==========================================

    function test_OversightCannotDepositEscrow() public {
        vm.prank(oversight);
        vm.expectRevert(AccessRegistry.OversightAccountsCannotTrade.selector);
        escrow.deposit(100 ether);
    }

    function test_OversightCannotWithdrawEscrow() public {
        vm.prank(oversight);
        vm.expectRevert(AccessRegistry.OversightAccountsCannotTrade.selector);
        escrow.withdraw(100 ether);
    }

    function test_OversightCannotCancelOrder() public {
        vm.prank(oversight);
        vm.expectRevert(AccessRegistry.OversightAccountsCannotTrade.selector);
        settlement.cancelOrder(1);
    }

    function test_OversightCannotClaimSettlement() public {
        bytes32[] memory proof = new bytes32[](0);
        vm.prank(oversight);
        vm.expectRevert(AccessRegistry.OversightAccountsCannotTrade.selector);
        settlement.claimSettlement(oversight, 20261009, 1, 100, 100, 0, 0, 0, proof);
    }

    function test_OversightCannotClaimCertificate() public {
        bytes32[] memory proof = new bytes32[](0);
        vm.prank(oversight);
        vm.expectRevert(AccessRegistry.OversightAccountsCannotTrade.selector);
        certificates.claimCertificate(1, 1, keccak256("dev-seller"), 1000, 0, 1, proof);
    }

    function test_OversightCannotTransferOrReceiveCertificate() public {
        // If someone tries to transfer a certificate to oversight, it reverts
        vm.prank(oversight);
        vm.expectRevert(AccessRegistry.OversightAccountsCannotTrade.selector);
        certificates.safeTransferFrom(oversight, buyer, 1, 1, "");

        vm.prank(buyer);
        vm.expectRevert(AccessRegistry.OversightAccountsCannotTrade.selector);
        certificates.safeTransferFrom(buyer, oversight, 1, 1, "");
    }

    function _signObligation(
        bytes32 obligationId,
        address _buyer,
        address _seller,
        uint256 amount,
        uint32 zoneId,
        uint32 intervalIdx,
        uint64 deadline,
        uint256 signerKey
    ) internal view returns (bytes memory) {
        bytes32 oblHash = settlement.hashObligation(obligationId, _buyer, _seller, amount, zoneId, intervalIdx, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, oblHash);
        return abi.encodePacked(r, s, v);
    }

    function test_OversightCannotBeOrderCounterparty() public {
        // Try locking obligation where oversight is buyer or seller
        bytes32 obligationId = keccak256("ob-oversight");
        uint64 deadline = uint64(block.timestamp + 86400);

        bytes memory sigBuyer = _signObligation(obligationId, oversight, seller, 100 ether, 1, 1, deadline, buyerKey);
        bytes memory sigSeller = _signObligation(obligationId, oversight, seller, 100 ether, 1, 1, deadline, sellerKey);

        // Buyer is oversight -> Revert OversightAccountsCannotTrade
        vm.prank(oversight);
        vm.expectRevert(AccessRegistry.OversightAccountsCannotTrade.selector);
        settlement.lockObligation(
            obligationId,
            oversight,
            seller,
            100 ether,
            1,
            1,
            deadline,
            sigBuyer,
            sigSeller
        );
    }

    function test_CannotGrantOversightRoleToTradedAccount() public {
        // Buyer deposits to escrow -> marked as traded
        vm.prank(buyer);
        escrow.deposit(500 ether);
        assertTrue(access.hasTraded(buyer), "Buyer should be marked as traded");

        // Admin attempts to grant REGULATOR_ROLE or OPERATOR_ROLE to buyer
        bytes32 regRole = access.REGULATOR_ROLE();
        bytes32 opRole = access.OPERATOR_ROLE();

        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.CannotGrantOversightRoleToTradedAccount.selector, buyer));
        access.grantRole(regRole, buyer);

        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.CannotGrantOversightRoleToTradedAccount.selector, buyer));
        access.grantRole(opRole, buyer);
        vm.stopPrank();
    }

    function test_RegularTradersTradeNormallyAndCannotPerformOversightActions() public {
        // Buyer deposits
        vm.prank(buyer);
        escrow.deposit(500 ether);
        assertEq(escrow.balances(buyer), 500 ether);

        // Buyer cannot freeze settlement (only regulator)
        vm.prank(buyer);
        vm.expectRevert();
        settlement.freezeSettlement(20261009, 1);

        // Buyer cannot revoke device (only operator / regulator / admin)
        vm.prank(buyer);
        vm.expectRevert();
        devices.revokeDevice(keccak256("dev-1"), "reason");
    }

    // ==========================================
    // PHASE 3 & 8: DOMAIN SEPARATION TESTS
    // ==========================================

    function test_CrossDomainTradeReverts() public {
        // Buyer is DEMO, liveSeller is LIVE (isDemo == false)
        bytes32 obligationId = keccak256("ob-cross-domain");
        uint64 deadline = uint64(block.timestamp + 86400);

        bytes memory sig1 = _signObligation(obligationId, buyer, liveSeller, 100 ether, 1, 1, deadline, buyerKey);
        bytes memory sig2 = _signObligation(obligationId, buyer, liveSeller, 100 ether, 1, 1, deadline, liveSellerKey);

        vm.prank(oversight);
        vm.expectRevert(abi.encodeWithSelector(BatchSettlement.CrossDomainTradeProhibited.selector, buyer, liveSeller));
        settlement.lockObligation(
            obligationId,
            buyer,
            liveSeller,
            100 ether,
            1,
            1,
            deadline,
            sig1,
            sig2
        );
    }

    function test_SettlementFreezeByRegulator() public {
        uint32 dateEpoch = 20261009;
        uint32 zoneId = 1;
        
        // Oversight has REGULATOR_ROLE -> can freeze settlement for a zone
        vm.prank(oversight);
        settlement.freezeSettlement(dateEpoch, zoneId);
        assertTrue(settlement.settlementFrozen(dateEpoch, zoneId));

        // When frozen, claiming settlement reverts
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(BatchSettlement.SettlementFrozen.selector, dateEpoch, zoneId));
        settlement.claimSettlement(seller, dateEpoch, zoneId, 100, 100, 0, 0, 0, emptyProof);

        // Regulator unfreezes
        vm.prank(oversight);
        settlement.unfreezeSettlement(dateEpoch, zoneId);
        assertFalse(settlement.settlementFrozen(dateEpoch, zoneId));
    }

    // ==========================================
    // PHASE 5: DEPLOY SCRIPT DEVNET RESTRICTION
    // ==========================================

    function test_DeployScriptRejectsNonDevnetForOversight() public {
        DeployScript deployScript = new DeployScript();
        // Switch chain id away from 31337 (e.g. Sepolia 11155111)
        vm.chainId(11155111);
        vm.expectRevert("Dual oversight roles can only be granted on devnet (chainid 31337)");
        deployScript.run();
    }
}
