// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "../src/AccessRegistry.sol";
import "../src/DeviceRegistry.sol";
import "../src/EpochOracle.sol";
import "../src/CertificateRegistry.sol";
import "../src/RetirementRegistry.sol";

contract CertificatesTest is Test {
    using MessageHashUtils for bytes32;

    AccessRegistry public access;
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
    uint8 public constant TEST_SOURCE_TYPE = 1;

    function setUp() public {
        oracleAddr = vm.addr(oracleKey);

        vm.startPrank(admin);
        access = new AccessRegistry(admin);
        access.grantRole(access.REGISTRAR_ROLE(), admin);
        access.grantRole(access.ORACLE_ROLE(), oracleAddr);

        devices = new DeviceRegistry(address(access));
        oracle = new EpochOracle(address(access), 1);

        certificates = new CertificateRegistry(
            address(access),
            address(oracle),
            address(devices),
            "https://dex.energy/api/cert/{id}.json"
        );

        retirement = new RetirementRegistry(address(access), address(certificates));
        certificates.setRetirementRegistry(address(retirement));

        // Register valid device
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
        vm.stopPrank();
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

        bytes32 root = leafHash; // Single leaf tree -> root == leaf

        // Oracle signs and finalizes epoch
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

        // Prosumer claims ERC-1155 certificate
        bytes32[] memory emptyProof = new bytes32[](0);
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

        // Double claim must revert
        vm.prank(prosumer);
        vm.expectRevert();
        certificates.claimCertificate(
            TEST_ZONE_ID,
            TEST_INTERVAL_IDX,
            deviceId,
            TEST_ENERGY_WH,
            TEST_SOURCE_TYPE,
            counter,
            emptyProof
        );

        // Prosumer retires certificate
        vm.prank(prosumer);
        bytes32 nullifier = retirement.retire(
            tokenId,
            TEST_ENERGY_WH,
            "Delhi Metro Rail Corporation",
            "Scope 2 Carbon Offset 2026"
        );

        assertTrue(retirement.retiredNullifiers(nullifier));
        assertEq(certificates.balanceOf(prosumer, tokenId), 0);
    }
}
