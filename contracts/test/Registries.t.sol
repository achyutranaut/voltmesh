// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccessRegistry.sol";
import "../src/ParticipantRegistry.sol";
import "../src/DeviceRegistry.sol";

contract RegistriesTest is Test {
    AccessRegistry public access;
    ParticipantRegistry public participants;
    DeviceRegistry public devices;

    address public admin = address(0xAD);
    address public registrar = address(0xBE);
    address public prosumer = address(0xCAFE);

    uint256 public meterPrivateKey = 0xA11CE;
    address public meterSigner;

    function setUp() public {
        meterSigner = vm.addr(meterPrivateKey);

        vm.startPrank(admin);
        access = new AccessRegistry(admin);

        // Grant REGISTRAR_ROLE to registrar via direct admin role for setup
        access.grantRole(access.REGISTRAR_ROLE(), registrar);

        participants = new ParticipantRegistry(address(access));
        devices = new DeviceRegistry(address(access));
        vm.stopPrank();
    }

    function test_AccessRegistry_TimelockRoleGrant() public {
        address newOperator = address(0x999);
        vm.startPrank(admin);
        bytes32 propId = access.proposeRoleGrant(access.OPERATOR_ROLE(), newOperator);

        // Immediate execution fails
        vm.expectRevert();
        access.executeRoleGrant(propId);

        // Warp time 1 day
        vm.warp(block.timestamp + 1 days + 1);
        access.executeRoleGrant(propId);

        assertTrue(access.hasRole(access.OPERATOR_ROLE(), newOperator));
        vm.stopPrank();
    }

    function test_ParticipantRegistry_RegisterAndDuplicateBinding() public {
        bytes32 partId = keccak256("part-1");
        bytes32 bindingHash = keccak256("discom-acc-001");

        vm.prank(registrar);
        participants.registerParticipant(
            prosumer,
            partId,
            1, // zoneId
            ParticipantRegistry.RoleType.PROSUMER,
            bindingHash
        );

        assertTrue(participants.isRegisteredAndActive(prosumer));

        // Attempting to register another wallet with the SAME binding hash must revert
        address duplicateProsumer = address(0xBEEF);
        vm.prank(registrar);
        vm.expectRevert();
        participants.registerParticipant(
            duplicateProsumer,
            keccak256("part-2"),
            1,
            ParticipantRegistry.RoleType.PROSUMER,
            bindingHash
        );
    }

    function test_DeviceRegistry_RegistrationAndEquivocation() public {
        bytes32 deviceId = keccak256("device-001");
        bytes32 partId = keccak256("part-1");

        vm.prank(registrar);
        devices.registerDevice(
            deviceId,
            meterSigner,
            DeviceRegistry.SignerType.DEVICE_SE,
            DeviceRegistry.SourceType.SOLAR_PV,
            1,
            5000, // 5kW capacity Wh
            100,
            partId
        );

        assertTrue(devices.isDeviceValid(deviceId));
        assertTrue(devices.checkCapacity(deviceId, 5000));
        assertFalse(devices.checkCapacity(deviceId, 6000)); // > 115% tolerance

        // Simulate equivocation attack: two differing readings signed by the meter for SAME interval 100
        DeviceRegistry.ReadingRecord memory readingA = DeviceRegistry.ReadingRecord({
            zoneId: 1,
            intervalIdx: 100,
            energyWh: 2000,
            direction: 0,
            counter: 1
        });

        DeviceRegistry.ReadingRecord memory readingB = DeviceRegistry.ReadingRecord({
            zoneId: 1,
            intervalIdx: 100,
            energyWh: 2500,
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

        // Anyone submits equivocation proof
        address reporter = address(0x777);
        vm.prank(reporter);
        devices.submitEquivocationProof(deviceId, readingA, sigA, readingB, sigB);

        // Device must now be revoked
        assertFalse(devices.isDeviceValid(deviceId));
    }
}
