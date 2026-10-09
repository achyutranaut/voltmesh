// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./AccessRegistry.sol";

/**
 * @title DeviceRegistry
 * @notice Registers physical smart meters, simulated meters, and institutional DISCOM signers.
 *         Enforces per-device capacity limits and verifies cryptographic equivocation dispute proofs.
 */
contract DeviceRegistry {
    using ECDSA for bytes32;

    AccessRegistry public immutable accessRegistry;

    enum SignerType { SIMULATED, DEVICE_SE, DISCOM_MDMS }
    enum SourceType { SOLAR_PV, WIND, STORAGE, GRID }

    struct Device {
        address signerAddress;
        SignerType signerType;
        SourceType sourceType;
        uint32 zoneId;
        uint64 capacityWh;
        uint8 trustWeight;
        bool isRevoked;
        bytes32 participantId;
        uint64 registeredAt;
    }

    mapping(bytes32 => Device) public devices;

    event DeviceRegistered(
        bytes32 indexed deviceId,
        address indexed signerAddress,
        uint32 indexed zoneId,
        SignerType signerType,
        uint64 capacityWh
    );
    event DeviceRevoked(bytes32 indexed deviceId, string reason);
    event DeviceRevokedForEquivocation(bytes32 indexed deviceId, address indexed reporter);

    error CallerNotRegistrar();
    error DeviceAlreadyRegistered(bytes32 deviceId);
    error DeviceNotFound(bytes32 deviceId);
    error DeviceIsRevoked(bytes32 deviceId);
    error InvalidEquivocationSignatures();
    error EquivocationMismatchedKey();
    error NotEquivocation();
    error SystemPaused();

    modifier onlyRegistrar() {
        if (!accessRegistry.hasRole(accessRegistry.REGISTRAR_ROLE(), msg.sender)) {
            revert CallerNotRegistrar();
        }
        _;
    }

    modifier whenNotPaused() {
        if (accessRegistry.paused()) revert SystemPaused();
        _;
    }

    constructor(address _accessRegistry) {
        accessRegistry = AccessRegistry(_accessRegistry);
    }

    function registerDevice(
        bytes32 deviceId,
        address signerAddress,
        SignerType signerType,
        SourceType sourceType,
        uint32 zoneId,
        uint64 capacityWh,
        uint8 trustWeight,
        bytes32 participantId
    ) external onlyRegistrar whenNotPaused {
        if (devices[deviceId].registeredAt != 0) {
            revert DeviceAlreadyRegistered(deviceId);
        }

        devices[deviceId] = Device({
            signerAddress: signerAddress,
            signerType: signerType,
            sourceType: sourceType,
            zoneId: zoneId,
            capacityWh: capacityWh,
            trustWeight: trustWeight,
            isRevoked: false,
            participantId: participantId,
            registeredAt: uint64(block.timestamp)
        });

        emit DeviceRegistered(deviceId, signerAddress, zoneId, signerType, capacityWh);
    }

    error CallerNotAuthorized();

    function revokeDevice(bytes32 deviceId, string calldata reason) external {
        if (!accessRegistry.hasRole(accessRegistry.REGISTRAR_ROLE(), msg.sender) &&
            !accessRegistry.hasRole(accessRegistry.OPERATOR_ROLE(), msg.sender) &&
            !accessRegistry.hasRole(accessRegistry.REGULATOR_ROLE(), msg.sender) &&
            !accessRegistry.hasRole(accessRegistry.AUDITOR_ROLE(), msg.sender)) {
            revert CallerNotAuthorized();
        }
        Device storage d = devices[deviceId];
        if (d.registeredAt == 0) revert DeviceNotFound(deviceId);
        d.isRevoked = true;
        emit DeviceRevoked(deviceId, reason);
    }

    struct ReadingRecord {
        uint32 zoneId;
        uint32 intervalIdx;
        uint64 energyWh;
        uint8 direction;
        uint64 counter;
    }

    error MismatchedInterval(uint32 intervalA, uint32 intervalB);

    /**
     * @notice Allows anyone to submit cryptographic proof of meter equivocation.
     *         If the same device key signed two conflicting readings for the SAME interval,
     *         the device is automatically revoked immediately.
     */
    function submitEquivocationProof(
        bytes32 deviceId,
        ReadingRecord calldata readingA,
        bytes calldata sigA,
        ReadingRecord calldata readingB,
        bytes calldata sigB
    ) external {
        Device storage d = devices[deviceId];
        if (d.registeredAt == 0) revert DeviceNotFound(deviceId);
        if (d.isRevoked) revert DeviceIsRevoked(deviceId);
        if (readingA.intervalIdx != readingB.intervalIdx) {
            revert MismatchedInterval(readingA.intervalIdx, readingB.intervalIdx);
        }

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

        if (hashA == hashB) revert NotEquivocation();

        address recoveredA = hashA.recover(sigA);
        address recoveredB = hashB.recover(sigB);

        if (recoveredA != d.signerAddress || recoveredB != d.signerAddress) {
            revert EquivocationMismatchedKey();
        }

        d.isRevoked = true;
        emit DeviceRevokedForEquivocation(deviceId, msg.sender);
    }

    function isDeviceValid(bytes32 deviceId) external view returns (bool) {
        Device storage d = devices[deviceId];
        return d.registeredAt != 0 && !d.isRevoked;
    }

    function getDevice(bytes32 deviceId) external view returns (Device memory) {
        return devices[deviceId];
    }

    function checkCapacity(bytes32 deviceId, uint64 readingWh) external view returns (bool) {
        Device storage d = devices[deviceId];
        if (d.registeredAt == 0 || d.isRevoked) return false;
        // 15% tolerance on rated 15-minute capacity
        uint64 maxAllowed = (d.capacityWh * 115) / 100;
        return readingWh <= maxAllowed;
    }
}
