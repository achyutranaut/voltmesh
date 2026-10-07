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
import "../src/RetirementRegistry.sol";
import "../src/mocks/MockERC20.sol";

contract SecurityAuditTest is Test {
    using MessageHashUtils for bytes32;

    AccessRegistry public access;
    ParticipantRegistry public participants;
    DeviceRegistry public devices;
    EpochOracle public oracle;
    Escrow public escrow;
    BatchSettlement public settlement;
    CertificateRegistry public certificates;
    RetirementRegistry public retirement;
    MockERC20 public token;

    address public admin = address(0xAD);
    address public operator = address(0x09);
    address public prosumer = address(0xCAFE);
    address public attacker = address(0xDEAD);

    uint256 public oracleKey = 0x101;
    address public oracleAddr;

    uint256 public meterPrivateKey = 0xA11CE;
    address public meterSigner;
    bytes32 public deviceId = keccak256("meter-security-test-01");
    bytes32 public prosumerPartId = keccak256("participant-cafe");

    uint32 public constant TEST_ZONE_ID = 1;
    uint32 public constant TEST_INTERVAL_IDX = 100;
    uint64 public constant TEST_ENERGY_WH = 3000;
    uint8 public constant TEST_SOURCE_TYPE = 0; // 0 = SOLAR_PV

    function setUp() public {
        oracleAddr = vm.addr(oracleKey);
        meterSigner = vm.addr(meterPrivateKey);

        vm.startPrank(admin);
        access = new AccessRegistry(admin);
        access.grantRole(access.REGISTRAR_ROLE(), admin);
        access.grantRole(access.OPERATOR_ROLE(), operator);
        access.grantRole(access.ORACLE_ROLE(), oracleAddr);

        participants = new ParticipantRegistry(address(access));
        devices = new DeviceRegistry(address(access));
        oracle = new EpochOracle(address(access), 1);

        token = new MockERC20("Settlement USD", "vUSD");
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
            "https://voltmesh.energy/api/cert/{id}.json"
        );
        retirement = new RetirementRegistry(address(access), address(certificates));
        certificates.setRetirementRegistry(address(retirement));

        // Register prosumer
        participants.registerParticipant(
            prosumer,
            prosumerPartId,
            TEST_ZONE_ID,
            ParticipantRegistry.RoleType.PROSUMER,
            keccak256("discom-cafe-binding")
        );

        // Register meter device bound to prosumer
        devices.registerDevice(
            deviceId,
            meterSigner,
            DeviceRegistry.SignerType.DEVICE_SE,
            DeviceRegistry.SourceType.SOLAR_PV,
            TEST_ZONE_ID,
            5000, // capacity Wh
            100,  // trust weight
            prosumerPartId
        );

        token.mint(admin, 1_000_000);
        token.mint(prosumer, 100_000);
        vm.warp(TEST_INTERVAL_IDX * 900 + 10);
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // VULN-SC-01: Front-running GAC Mint Theft Prevention
    // -------------------------------------------------------------------------
    function test_VULN_SC_01_FrontrunningMintTheftPrevented() public {
        uint64 counter = 1;
        bytes32 leafHash = keccak256(
            abi.encodePacked(
                bytes1(0x00),
                deviceId,
                TEST_ZONE_ID,
                TEST_INTERVAL_IDX,
                TEST_ENERGY_WH,
                uint8(0),
                counter
            )
        );

        bytes32 root = leafHash;
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                block.chainid,
                address(oracle),
                TEST_ZONE_ID,
                TEST_INTERVAL_IDX,
                root,
                uint32(1),
                TEST_ENERGY_WH
            )
        ).toEthSignedMessageHash();

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oracleKey, messageHash);
        bytes[] memory signatures = new bytes[](1);
        signatures[0] = abi.encodePacked(r, s, v);

        oracle.submitEpoch(TEST_ZONE_ID, TEST_INTERVAL_IDX, root, 1, TEST_ENERGY_WH, signatures);

        bytes32[] memory emptyProof = new bytes32[](0);

        // 1. Attacker attempts front-running claim
        vm.prank(attacker);
        vm.expectRevert(CertificateRegistry.UnauthorizedClaimant.selector);
        certificates.claimCertificate(
            TEST_ZONE_ID,
            TEST_INTERVAL_IDX,
            deviceId,
            TEST_ENERGY_WH,
            TEST_SOURCE_TYPE,
            counter,
            emptyProof
        );

        // 2. Legitimate Prosumer claims -> Succeeds and receives tokens
        vm.prank(prosumer);
        uint256 tokenId = certificates.claimCertificate(
            TEST_ZONE_ID,
            TEST_INTERVAL_IDX,
            deviceId,
            TEST_ENERGY_WH,
            TEST_SOURCE_TYPE,
            counter,
            emptyProof
        );

        assertEq(certificates.balanceOf(prosumer, tokenId), TEST_ENERGY_WH);
        assertEq(certificates.balanceOf(attacker, tokenId), 0);
    }

    function test_VULN_SC_01_OperatorCannotClaimForOwner() public {
        uint64 counter = 2;
        uint32 intervalIdx = 101;
        vm.warp(intervalIdx * 900 + 10);
        bytes32 leafHash = keccak256(
            abi.encodePacked(
                bytes1(0x00),
                deviceId,
                TEST_ZONE_ID,
                intervalIdx,
                TEST_ENERGY_WH,
                uint8(0),
                counter
            )
        );

        bytes32 root = leafHash;
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                block.chainid,
                address(oracle),
                TEST_ZONE_ID,
                intervalIdx,
                root,
                uint32(1),
                TEST_ENERGY_WH
            )
        ).toEthSignedMessageHash();

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oracleKey, messageHash);
        bytes[] memory signatures = new bytes[](1);
        signatures[0] = abi.encodePacked(r, s, v);

        oracle.submitEpoch(TEST_ZONE_ID, intervalIdx, root, 1, TEST_ENERGY_WH, signatures);

        bytes32[] memory emptyProof = new bytes32[](0);

        // Operator relayer cannot claim on behalf of prosumer; strictly owner-only
        vm.prank(operator);
        vm.expectRevert(CertificateRegistry.UnauthorizedClaimant.selector);
        certificates.claimCertificate(
            TEST_ZONE_ID,
            intervalIdx,
            deviceId,
            TEST_ENERGY_WH,
            TEST_SOURCE_TYPE,
            counter,
            emptyProof
        );
    }

    // -------------------------------------------------------------------------
    // VULN-SC-02: Cross-Interval Equivocation Abuse Prevention
    // -------------------------------------------------------------------------
    function test_VULN_SC_02_CrossIntervalEquivocationAbusePrevented() public {
        // Meter signs reading for interval 100
        DeviceRegistry.ReadingRecord memory readingA = DeviceRegistry.ReadingRecord({
            zoneId: 1,
            intervalIdx: 100,
            energyWh: 1500,
            direction: 0,
            counter: 1
        });

        // Meter signs legitimate subsequent reading for interval 101
        DeviceRegistry.ReadingRecord memory readingB = DeviceRegistry.ReadingRecord({
            zoneId: 1,
            intervalIdx: 101,
            energyWh: 1600,
            direction: 0,
            counter: 2
        });

        bytes32 hashA = keccak256(
            abi.encodePacked(
                bytes1(0x00),
                deviceId,
                readingA.zoneId,
                readingA.intervalIdx,
                readingA.energyWh,
                readingA.direction,
                readingA.counter
            )
        );

        bytes32 hashB = keccak256(
            abi.encodePacked(
                bytes1(0x00),
                deviceId,
                readingB.zoneId,
                readingB.intervalIdx,
                readingB.energyWh,
                readingB.direction,
                readingB.counter
            )
        );

        (uint8 vA, bytes32 rA, bytes32 sA) = vm.sign(meterPrivateKey, hashA);
        bytes memory sigA = abi.encodePacked(rA, sA, vA);

        (uint8 vB, bytes32 rB, bytes32 sB) = vm.sign(meterPrivateKey, hashB);
        bytes memory sigB = abi.encodePacked(rB, sB, vB);

        // Attacker attempts to revoke the meter using readings from different intervals
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(
                DeviceRegistry.MismatchedInterval.selector,
                100,
                101
            )
        );
        devices.submitEquivocationProof(deviceId, readingA, sigA, readingB, sigB);

        // Verify device remains valid and active
        assertTrue(devices.isDeviceValid(deviceId));

        // Now simulate genuine equivocation: two differing readings for the SAME interval 100
        DeviceRegistry.ReadingRecord memory conflictingReading = DeviceRegistry.ReadingRecord({
            zoneId: 1,
            intervalIdx: 100,
            energyWh: 2500, // Conflict!
            direction: 0,
            counter: 3
        });

        bytes32 hashConflict = keccak256(
            abi.encodePacked(
                bytes1(0x00),
                deviceId,
                conflictingReading.zoneId,
                conflictingReading.intervalIdx,
                conflictingReading.energyWh,
                conflictingReading.direction,
                conflictingReading.counter
            )
        );

        (uint8 vC, bytes32 rC, bytes32 sC) = vm.sign(meterPrivateKey, hashConflict);
        bytes memory sigConflict = abi.encodePacked(rC, sC, vC);

        // Valid equivocation proof submitted
        vm.prank(attacker);
        devices.submitEquivocationProof(deviceId, readingA, sigA, conflictingReading, sigConflict);

        // Verify device is now permanently revoked
        assertFalse(devices.isDeviceValid(deviceId));
    }

    // -------------------------------------------------------------------------
    // VULN-SC-03: Timelock Bypass Prevention
    // -------------------------------------------------------------------------
    function test_VULN_SC_03_TimelockBypassPrevented() public {
        address newAdmin = address(0x999);
        bytes32 adminRole = access.DEFAULT_ADMIN_ROLE();

        // Lock direct grants
        vm.prank(admin);
        access.disableDirectGrants();

        // Direct grantRole must now revert
        vm.prank(admin);
        vm.expectRevert(AccessRegistry.DirectGrantDisabled.selector);
        access.grantRole(adminRole, newAdmin);

        // Timelock pathway must be used
        vm.startPrank(admin);
        bytes32 propId = access.proposeRoleGrant(adminRole, newAdmin);

        // Attempt early execution -> fails
        vm.expectRevert();
        access.executeRoleGrant(propId);

        // Warp 24 hours
        vm.warp(block.timestamp + 1 days + 1);
        access.executeRoleGrant(propId);

        assertTrue(access.hasRole(adminRole, newAdmin));
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // VULN-SC-05: On-Chain Order Cancellation
    // -------------------------------------------------------------------------
    function test_VULN_SC_05_OnChainOrderCancellation() public {
        uint256 nonce = 12345;

        // Active participant cancels order
        vm.prank(prosumer);
        settlement.cancelOrder(nonce);

        assertTrue(settlement.isOrderCancelled(prosumer, nonce));
        assertFalse(settlement.isOrderCancelled(prosumer, 99999));

        // Non-registered participant cannot cancel
        vm.prank(attacker);
        vm.expectRevert();
        settlement.cancelOrder(nonce);
    }

    // -------------------------------------------------------------------------
    // VULN-SC-04: Settlement Pool Funding & Claim Execution
    // -------------------------------------------------------------------------
    function test_VULN_SC_04_SettlementPoolFundingAndClaim() public {
        uint256 poolAmount = 50_000;

        // Admin funds settlement pool
        vm.startPrank(admin);
        token.approve(address(settlement), poolAmount);
        settlement.fundSettlementPool(poolAmount);
        vm.stopPrank();

        assertEq(escrow.balances(address(settlement)), poolAmount);

        // Setup statement
        uint32 zoneId = 1;
        uint32 dateEpoch = 20000;
        int256 netAmount = 5000;
        uint64 deliveredWh = 10_000;
        uint32 leafIndex = 0;

        bytes32 leafHash = keccak256(
            abi.encodePacked(
                bytes1(0x02),
                prosumer,
                dateEpoch,
                netAmount,
                deliveredWh,
                uint64(0),
                uint64(0),
                leafIndex
            )
        );

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                block.chainid,
                address(settlement),
                dateEpoch,
                zoneId,
                leafHash,
                uint256(5000),
                uint256(5000)
            )
        ).toEthSignedMessageHash();

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oracleKey, messageHash);
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = abi.encodePacked(r, s, v);

        vm.prank(operator);
        settlement.postDailyStatement(dateEpoch, zoneId, leafHash, 5000, 5000, sigs);

        bytes32[] memory emptyProof = new bytes32[](0);

        // Prosumer attempting to claim before debits are collected reverts with SettlementPoolExhausted
        vm.prank(prosumer);
        vm.expectRevert(BatchSettlement.SettlementPoolExhausted.selector);
        settlement.claimSettlement(
            dateEpoch,
            zoneId,
            netAmount,
            deliveredWh,
            0,
            0,
            leafIndex,
            emptyProof
        );

        // Operator explicitly funds statement shortfall
        vm.prank(admin);
        token.transfer(operator, 5000);
        vm.startPrank(operator);
        token.approve(address(settlement), 5000);
        settlement.fundStatementShortfall(dateEpoch, zoneId, 5000);
        vm.stopPrank();

        // Prosumer claims settlement successfully now that statement debits are backed
        vm.prank(prosumer);
        settlement.claimSettlement(
            dateEpoch,
            zoneId,
            netAmount,
            deliveredWh,
            0,
            0,
            leafIndex,
            emptyProof
        );

        // Prosumer's balance in escrow increased by 5000
        assertEq(escrow.balances(prosumer), 5000);
        // Settlement contract's pool balance: initial poolAmount + 5000 shortfall - 5000 claimed = poolAmount
        assertEq(escrow.balances(address(settlement)), poolAmount);
    }
}
