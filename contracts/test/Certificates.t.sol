// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "../src/AccessRegistry.sol";
import "../src/DeviceRegistry.sol";
import "../src/ParticipantRegistry.sol";
import "../src/EpochOracle.sol";
import "../src/CertificateRegistry.sol";
import "../src/RetirementRegistry.sol";

contract CertificatesTest is Test {
    using MessageHashUtils for bytes32;

    AccessRegistry public access;
    ParticipantRegistry public participants;
    DeviceRegistry public devices;
    EpochOracle public oracle;
    CertificateRegistry public certificates;
    RetirementRegistry public retirement;

    address public admin = address(0xAD);
    address public prosumer = address(0xCAFE);

    uint256 public oracleKey = 0x101;
    address public oracleAddr;

    bytes32 public deviceId = keccak256("device-solar-01");
    uint32 public constant TEST_ZONE_ID = 1;
    uint32 public constant TEST_INTERVAL_IDX = 100;
    uint64 public constant TEST_ENERGY_WH = 1250;
    uint8 public constant TEST_SOURCE_TYPE = 0; // 0 = SOLAR_PV

    function setUp() public {
        oracleAddr = vm.addr(oracleKey);

        vm.startPrank(admin);
        access = new AccessRegistry(admin);
        access.grantRole(access.REGISTRAR_ROLE(), admin);
        access.grantRole(access.ORACLE_ROLE(), oracleAddr);

        participants = new ParticipantRegistry(address(access));
        devices = new DeviceRegistry(address(access));
        oracle = new EpochOracle(address(access), 1);

        // Register prosumer in ParticipantRegistry
        participants.registerParticipant(
            prosumer,
            keccak256("part-cafe"),
            TEST_ZONE_ID,
            ParticipantRegistry.RoleType.PROSUMER,
            keccak256("discom-cafe")
        );

        certificates = new CertificateRegistry(
            address(access),
            address(oracle),
            address(devices),
            address(participants),
            "https://dex.energy/api/cert/{id}.json"
        );

        retirement = new RetirementRegistry(address(access), address(certificates));
        certificates.setRetirementRegistry(address(retirement));

        // Register valid device as SOLAR_PV (enum index 0)
        devices.registerDevice(
            deviceId,
            prosumer,
            DeviceRegistry.SignerType.DEVICE_SE,
            DeviceRegistry.SourceType.SOLAR_PV,
            TEST_ZONE_ID,
            5000, // capacity Wh
            100,
            keccak256("part-cafe")
        );

        vm.warp(TEST_INTERVAL_IDX * 900 + 10);
        vm.stopPrank();
    }

    function _finalizeTestEpoch(bytes32 root) internal {
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

        oracle.submitEpoch(
            TEST_ZONE_ID,
            TEST_INTERVAL_IDX,
            root,
            1,
            TEST_ENERGY_WH,
            signatures
        );
    }

    function test_Certificates_ClaimAndRetire() public {
        uint64 counter = 1;

        // Leaf hash for solar injection (direction 0)
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

        _finalizeTestEpoch(leafHash);

        bytes32[] memory emptyProof = new bytes32[](0);

        // Prosumer claims certificate
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

        assertGt(tokenId, 0);
        assertEq(certificates.balanceOf(prosumer, tokenId), TEST_ENERGY_WH);

        // Retire certificate
        vm.prank(prosumer);
        bytes32 nullifier = retirement.retire(
            tokenId,
            TEST_ENERGY_WH,
            "Delhi Metro Rail Corp",
            "Scope 2 Decarbonization"
        );

        assertGt(uint256(nullifier), 0);
        assertEq(certificates.balanceOf(prosumer, tokenId), 0);
        assertTrue(retirement.retiredNullifiers(nullifier));

        // Re-retiring with the exact same details must revert (nullifier already spent)
        vm.prank(prosumer);
        vm.expectRevert(abi.encodeWithSelector(RetirementRegistry.NullifierAlreadySpent.selector, nullifier));
        retirement.retire(
            tokenId,
            TEST_ENERGY_WH,
            "Delhi Metro Rail Corp",
            "Scope 2 Decarbonization"
        );
    }

    // P1-12: Claimant claiming WIND for a SOLAR device must revert
    function test_Certificates_MismatchedSourceTypeReverts() public {
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
        _finalizeTestEpoch(leafHash);

        bytes32[] memory emptyProof = new bytes32[](0);

        // Prosumer attempts to claim with sourceType = 1 (WIND) when device is registered as 0 (SOLAR_PV)
        vm.prank(prosumer);
        vm.expectRevert(abi.encodeWithSelector(CertificateRegistry.MismatchedSourceType.selector, 1, 0));
        certificates.claimCertificate(
            TEST_ZONE_ID,
            TEST_INTERVAL_IDX,
            deviceId,
            TEST_ENERGY_WH,
            1, // WIND
            counter,
            emptyProof
        );
    }

    // P1-12: Claiming for an unregistered device must revert
    function test_Certificates_UnregisteredDeviceReverts() public {
        bytes32 unknownDevice = keccak256("unknown-device");
        bytes32[] memory emptyProof = new bytes32[](0);

        vm.prank(prosumer);
        vm.expectRevert(abi.encodeWithSelector(CertificateRegistry.DeviceNotRegisteredOrRevoked.selector, unknownDevice));
        certificates.claimCertificate(
            TEST_ZONE_ID,
            TEST_INTERVAL_IDX,
            unknownDevice,
            TEST_ENERGY_WH,
            TEST_SOURCE_TYPE,
            1,
            emptyProof
        );
    }
}
