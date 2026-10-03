// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "./AccessRegistry.sol";
import "./EpochOracle.sol";
import "./DeviceRegistry.sol";
import "./ParticipantRegistry.sol";

/**
 * @title CertificateRegistry
 * @notice Issues Granular Attestation Certificates (GACs) as ERC-1155 fractional units.
 *         Minting is gated by Merkle proofs against finalized EpochOracle commitments.
 */
contract CertificateRegistry is ERC1155 {
    bytes1 public constant LEAF_PREFIX = 0x00;

    AccessRegistry public immutable accessRegistry;
    EpochOracle public immutable epochOracle;
    DeviceRegistry public immutable deviceRegistry;
    ParticipantRegistry public immutable participantRegistry;
    address public retirementRegistry;

    // nullifier => isClaimed (prevents double claiming of the same meter leaf)
    mapping(bytes32 => bool) public claimedLeaves;

    event CertificateMinted(
        address indexed claimant,
        uint256 indexed tokenId,
        uint64 amountWh,
        bytes32 indexed leafNullifier
    );
    event RetirementRegistryUpdated(address newRetirementRegistry);

    error CallerNotRetirement();
    error CallerNotAdmin();
    error UnauthorizedClaimant();
    error DeviceOwnerNotFound(bytes32 deviceId);
    error LeafAlreadyMinted(bytes32 nullifier);
    error InvalidOracleProof();
    error DeviceNotRegisteredOrRevoked(bytes32 deviceId);
    error ExceedsRatedCapacity(bytes32 deviceId, uint64 energyWh);
    error SystemPaused();

    modifier onlyRetirement() {
        if (msg.sender != retirementRegistry) revert CallerNotRetirement();
        _;
    }

    modifier whenNotPaused() {
        if (accessRegistry.paused()) revert SystemPaused();
        _;
    }

    constructor(
        address _accessRegistry,
        address _epochOracle,
        address _deviceRegistry,
        address _participantRegistry,
        string memory uri_
    ) ERC1155(uri_) {
        accessRegistry = AccessRegistry(_accessRegistry);
        epochOracle = EpochOracle(_epochOracle);
        deviceRegistry = DeviceRegistry(_deviceRegistry);
        participantRegistry = ParticipantRegistry(_participantRegistry);
    }

    function setRetirementRegistry(address _retirementRegistry) external {
        if (!accessRegistry.hasRole(accessRegistry.DEFAULT_ADMIN_ROLE(), msg.sender)) {
            revert CallerNotAdmin();
        }
        retirementRegistry = _retirementRegistry;
        emit RetirementRegistryUpdated(_retirementRegistry);
    }

    /**
     * @notice Lazily mints ERC-1155 certificates by proving injection in a finalized epoch.
     */
    function claimCertificate(
        uint32 zoneId,
        uint32 intervalIdx,
        bytes32 deviceId,
        uint64 energyWh,
        uint8 sourceType,
        uint64 counter,
        bytes32[] calldata oracleMerkleProof
    ) external whenNotPaused returns (uint256 tokenId) {
        if (!deviceRegistry.isDeviceValid(deviceId)) {
            revert DeviceNotRegisteredOrRevoked(deviceId);
        }
        if (!deviceRegistry.checkCapacity(deviceId, energyWh)) {
            revert ExceedsRatedCapacity(deviceId, energyWh);
        }

        DeviceRegistry.Device memory dev = deviceRegistry.getDevice(deviceId);
        address deviceOwner = participantRegistry.participantIdToWallet(dev.participantId);
        if (deviceOwner == address(0)) {
            revert DeviceOwnerNotFound(deviceId);
        }

        // Only the device owner or an approved operator can trigger claiming
        if (msg.sender != deviceOwner && !accessRegistry.hasRole(accessRegistry.OPERATOR_ROLE(), msg.sender)) {
            revert UnauthorizedClaimant();
        }

        bytes32 nullifier = keccak256(abi.encodePacked(deviceId, intervalIdx, counter));
        if (claimedLeaves[nullifier]) revert LeafAlreadyMinted(nullifier);

        // Direction 0 = INJECTION
        bytes32 leafHash = keccak256(
            abi.encodePacked(
                LEAF_PREFIX,
                deviceId,
                zoneId,
                intervalIdx,
                energyWh,
                uint8(0),
                counter
            )
        );

        bool isValid = epochOracle.verifyLeafInclusion(zoneId, intervalIdx, leafHash, oracleMerkleProof);
        if (!isValid) revert InvalidOracleProof();

        claimedLeaves[nullifier] = true;

        tokenId = uint256(keccak256(abi.encodePacked(zoneId, sourceType, intervalIdx)));
        // Mint strictly to deviceOwner, defeating front-running theft
        _mint(deviceOwner, tokenId, energyWh, "");

        emit CertificateMinted(deviceOwner, tokenId, energyWh, nullifier);
        return tokenId;
    }

    function burnForRetirement(
        address account,
        uint256 tokenId,
        uint256 amountWh
    ) external onlyRetirement {
        _burn(account, tokenId, amountWh);
    }
}
