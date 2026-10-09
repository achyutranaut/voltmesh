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
    error MismatchedSourceType(uint8 supplied, uint8 registered);
    error NonRenewableSourceType(uint8 sourceType);
    error MismatchedZoneId(uint32 providedZoneId, uint32 deviceZoneId);
    error InactiveOrSuspendedParticipant(address participant);
    error ParticipantNotProsumer(address participant);
    error AlreadyInitialized();
    error InvalidAddress();
    error SystemPaused();
    error OversightAccountsCannotTrade();

    modifier onlyRetirement() {
        if (msg.sender != retirementRegistry) revert CallerNotRetirement();
        _;
    }

    modifier onlyTrader(address account) {
        if (accessRegistry.isOversightAccount(account)) {
            revert OversightAccountsCannotTrade();
        }
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
        if (retirementRegistry != address(0)) {
            revert AlreadyInitialized();
        }
        if (_retirementRegistry == address(0)) {
            revert InvalidAddress();
        }
        retirementRegistry = _retirementRegistry;
        emit RetirementRegistryUpdated(_retirementRegistry);
    }

    function _validateClaimEligible(
        uint32 zoneId,
        bytes32 deviceId,
        uint64 energyWh,
        uint8 sourceType
    ) internal view returns (address deviceOwner) {
        if (!deviceRegistry.isDeviceValid(deviceId)) {
            revert DeviceNotRegisteredOrRevoked(deviceId);
        }
        if (!deviceRegistry.checkCapacity(deviceId, energyWh)) {
            revert ExceedsRatedCapacity(deviceId, energyWh);
        }

        DeviceRegistry.Device memory dev = deviceRegistry.getDevice(deviceId);

        if (dev.sourceType != DeviceRegistry.SourceType.SOLAR_PV && dev.sourceType != DeviceRegistry.SourceType.WIND) {
            revert NonRenewableSourceType(uint8(dev.sourceType));
        }
        if (sourceType != uint8(dev.sourceType)) {
            revert MismatchedSourceType(sourceType, uint8(dev.sourceType));
        }
        if (zoneId != dev.zoneId) {
            revert MismatchedZoneId(zoneId, dev.zoneId);
        }

        deviceOwner = participantRegistry.participantIdToWallet(dev.participantId);
        if (deviceOwner == address(0)) {
            revert DeviceOwnerNotFound(deviceId);
        }
        if (!participantRegistry.isRegisteredAndActive(deviceOwner)) {
            revert InactiveOrSuspendedParticipant(deviceOwner);
        }
        if (participantRegistry.getParticipantByWallet(deviceOwner).roleType != ParticipantRegistry.RoleType.PROSUMER) {
            revert ParticipantNotProsumer(deviceOwner);
        }
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
    ) external whenNotPaused onlyTrader(msg.sender) returns (uint256 tokenId) {
        address deviceOwner = _validateClaimEligible(zoneId, deviceId, energyWh, sourceType);

        if (msg.sender != deviceOwner) {
            revert UnauthorizedClaimant();
        }
        if (accessRegistry.isOversightAccount(deviceOwner) || accessRegistry.isOversightAccount(msg.sender)) {
            revert OversightAccountsCannotTrade();
        }
        accessRegistry.markTraded(deviceOwner);

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

    /**
     * @notice Enforces that certificate transfers can only be made to registered, active participants
     *         and never to oversight accounts (regulators/operators).
     */
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal virtual override {
        // If transferring to an account (not burning to address(0)), recipient must be registered, active, and not oversight
        if (to != address(0) && to != retirementRegistry) {
            if (accessRegistry.isOversightAccount(to)) {
                revert OversightAccountsCannotTrade();
            }
            if (!participantRegistry.isRegisteredAndActive(to)) {
                revert InactiveOrSuspendedParticipant(to);
            }
            accessRegistry.markTraded(to);
        }
        if (from != address(0)) {
            if (accessRegistry.isOversightAccount(from)) {
                revert OversightAccountsCannotTrade();
            }
            accessRegistry.markTraded(from);
        }
        super._update(from, to, ids, values);
    }
}

