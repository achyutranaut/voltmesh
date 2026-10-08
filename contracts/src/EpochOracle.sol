// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./AccessRegistry.sol";

/**
 * @title EpochOracle
 * @notice Validates t-of-N multi-operator oracle signatures over 15-minute zone Merkle roots.
 *         Once finalized, roots provide an immutable anchor for certificate claiming and settlement.
 */
contract EpochOracle {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    AccessRegistry public immutable accessRegistry;
    uint256 public quorumThreshold;

    uint32 public constant INTERVAL_DURATION = 900; // 15 minutes (in seconds)
    uint32 public constant MAX_EPOCH_LAG = 2880; // 30 days finality/dispute window (2880 15-min intervals)

    enum EpochStatus {
        NONE,
        FINALIZED,
        CHALLENGED,
        RESOLVED_VALID,
        RESOLVED_INVALID
    }

    struct EpochRecord {
        bytes32 merkleRoot;
        uint32 leafCount;
        uint64 totalWh;
        uint64 finalizedAt;
        EpochStatus status;
        address challenger;
    }

    // zoneId => intervalIdx => EpochRecord
    mapping(uint32 => mapping(uint32 => EpochRecord)) public epochs;

    event EpochSubmitted(uint32 indexed zoneId, uint32 indexed intervalIdx, bytes32 merkleRoot, uint64 totalWh);
    event EpochFinalized(uint32 indexed zoneId, uint32 indexed intervalIdx, bytes32 merkleRoot);
    event EpochChallenged(uint32 indexed zoneId, uint32 indexed intervalIdx, address indexed challenger, string reason);
    event EpochChallengeResolved(uint32 indexed zoneId, uint32 indexed intervalIdx, EpochStatus status, string resolutionDetails);
    event QuorumThresholdUpdated(uint256 oldQuorum, uint256 newQuorum);

    error EpochAlreadyFinalized(uint32 zoneId, uint32 intervalIdx);
    error InsufficientSignatures(uint256 count, uint256 required);
    error DuplicateOrUnsortedSigner(address signer);
    error SignerNotAuthorizedOracle(address signer);
    error EpochNotFound(uint32 zoneId, uint32 intervalIdx);
    error InvalidQuorumThreshold();
    error QuorumExceedsOracleCount(uint256 quorum, uint256 count);
    error FutureEpochNotAllowed(uint32 intervalIdx, uint32 currentInterval);
    error StaleEpochNotAllowed(uint32 intervalIdx, uint32 currentInterval);
    error InvalidEpochStatus();
    error EpochNotChallenged();
    error SystemPaused();
    error CallerNotAdmin();
    error CallerNotAuditor();
    error ZeroRoot();
    error ZeroLeafCount();
    error ChallengeWindowClosed();

    modifier whenNotPaused() {
        if (accessRegistry.paused()) revert SystemPaused();
        _;
    }

    constructor(address _accessRegistry, uint256 _quorumThreshold) {
        if (_quorumThreshold < 1) revert InvalidQuorumThreshold();
        accessRegistry = AccessRegistry(_accessRegistry);
        uint256 oracleCount = accessRegistry.getRoleMemberCount(accessRegistry.ORACLE_ROLE());
        if (oracleCount > 0 && _quorumThreshold > oracleCount) {
            revert QuorumExceedsOracleCount(_quorumThreshold, oracleCount);
        }
        quorumThreshold = _quorumThreshold;
    }

    function setQuorumThreshold(uint256 _newQuorum) external {
        if (!accessRegistry.hasRole(accessRegistry.DEFAULT_ADMIN_ROLE(), msg.sender)) {
            revert CallerNotAdmin();
        }
        if (_newQuorum < 1) revert InvalidQuorumThreshold();
        uint256 oracleCount = accessRegistry.getRoleMemberCount(accessRegistry.ORACLE_ROLE());
        if (oracleCount > 0 && _newQuorum > oracleCount) {
            revert QuorumExceedsOracleCount(_newQuorum, oracleCount);
        }
        uint256 old = quorumThreshold;
        quorumThreshold = _newQuorum;
        emit QuorumThresholdUpdated(old, _newQuorum);
    }

    /**
     * @notice Returns the current canonical 15-minute delivery interval index.
     */
    function currentInterval() public view returns (uint32) {
        return uint32(block.timestamp / INTERVAL_DURATION);
    }

    /**
     * @notice Returns whether an interval is in the future.
     */
    function isFutureInterval(uint32 intervalIdx) public view returns (bool) {
        return intervalIdx > currentInterval();
    }

    /**
     * @notice Submits an epoch Merkle root with t-of-N oracle signatures.
     *         Signatures must be strictly ascending by signer address to prevent duplicate count attacks.
     */
    function submitEpoch(
        uint32 zoneId,
        uint32 intervalIdx,
        bytes32 merkleRoot,
        uint32 leafCount,
        uint64 totalWh,
        bytes[] calldata signatures
    ) external whenNotPaused {
        if (merkleRoot == bytes32(0)) revert ZeroRoot();
        if (leafCount == 0) revert ZeroLeafCount();

        EpochRecord storage existingEpoch = epochs[zoneId][intervalIdx];
        if (existingEpoch.status != EpochStatus.NONE && existingEpoch.status != EpochStatus.RESOLVED_INVALID) {
            revert EpochAlreadyFinalized(zoneId, intervalIdx);
        }

        uint32 current = currentInterval();
        if (intervalIdx > current) {
            revert FutureEpochNotAllowed(intervalIdx, current);
        }
        if (current > intervalIdx + MAX_EPOCH_LAG) {
            revert StaleEpochNotAllowed(intervalIdx, current);
        }

        if (signatures.length < quorumThreshold) {
            revert InsufficientSignatures(signatures.length, quorumThreshold);
        }

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                block.chainid,
                address(this),
                zoneId,
                intervalIdx,
                merkleRoot,
                leafCount,
                totalWh
            )
        ).toEthSignedMessageHash();

        address lastSigner = address(0);
        bytes32 oracleRole = accessRegistry.ORACLE_ROLE();

        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = messageHash.recover(signatures[i]);
            if (signer <= lastSigner) {
                revert DuplicateOrUnsortedSigner(signer);
            }
            if (!accessRegistry.hasRole(oracleRole, signer)) {
                revert SignerNotAuthorizedOracle(signer);
            }
            lastSigner = signer;
        }

        epochs[zoneId][intervalIdx] = EpochRecord({
            merkleRoot: merkleRoot,
            leafCount: leafCount,
            totalWh: totalWh,
            finalizedAt: uint64(block.timestamp),
            status: EpochStatus.FINALIZED,
            challenger: address(0)
        });

        emit EpochSubmitted(zoneId, intervalIdx, merkleRoot, totalWh);
        emit EpochFinalized(zoneId, intervalIdx, merkleRoot);
    }

    function verifyLeafInclusion(
        uint32 zoneId,
        uint32 intervalIdx,
        bytes32 leafHash,
        bytes32[] calldata merkleProof
    ) external view returns (bool) {
        EpochRecord storage epoch = epochs[zoneId][intervalIdx];
        if (
            epoch.finalizedAt == 0 ||
            epoch.status == EpochStatus.CHALLENGED ||
            epoch.status == EpochStatus.RESOLVED_INVALID
        ) {
            return false;
        }
        return MerkleProof.verify(merkleProof, epoch.merkleRoot, leafHash);
    }

    function challengeEpoch(
        uint32 zoneId,
        uint32 intervalIdx,
        string calldata reason
    ) external whenNotPaused {
        if (!accessRegistry.hasRole(accessRegistry.AUDITOR_ROLE(), msg.sender)) {
            revert CallerNotAuditor();
        }
        EpochRecord storage epoch = epochs[zoneId][intervalIdx];
        if (epoch.finalizedAt == 0) revert EpochNotFound(zoneId, intervalIdx);
        if (epoch.status != EpochStatus.FINALIZED) revert InvalidEpochStatus();
        if (block.timestamp > epoch.finalizedAt + 30 days) revert ChallengeWindowClosed();

        epoch.status = EpochStatus.CHALLENGED;
        epoch.challenger = msg.sender;

        emit EpochChallenged(zoneId, intervalIdx, msg.sender, reason);
    }

    function resolveChallenge(
        uint32 zoneId,
        uint32 intervalIdx,
        bool isValid,
        string calldata resolutionDetails
    ) external whenNotPaused {
        if (!accessRegistry.hasRole(accessRegistry.DEFAULT_ADMIN_ROLE(), msg.sender)) {
            revert CallerNotAdmin();
        }
        EpochRecord storage epoch = epochs[zoneId][intervalIdx];
        if (epoch.status != EpochStatus.CHALLENGED) revert EpochNotChallenged();

        if (isValid) {
            epoch.status = EpochStatus.RESOLVED_VALID;
        } else {
            epoch.status = EpochStatus.RESOLVED_INVALID;
        }

        emit EpochChallengeResolved(zoneId, intervalIdx, epoch.status, resolutionDetails);
    }

    function getEpoch(uint32 zoneId, uint32 intervalIdx) external view returns (EpochRecord memory) {
        return epochs[zoneId][intervalIdx];
    }
}
