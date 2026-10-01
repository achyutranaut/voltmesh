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

    struct EpochRecord {
        bytes32 merkleRoot;
        uint32 leafCount;
        uint64 totalWh;
        uint64 finalizedAt;
        bool disputed;
    }

    // zoneId => intervalIdx => EpochRecord
    mapping(uint32 => mapping(uint32 => EpochRecord)) public epochs;

    event EpochSubmitted(uint32 indexed zoneId, uint32 indexed intervalIdx, bytes32 merkleRoot, uint64 totalWh);
    event EpochFinalized(uint32 indexed zoneId, uint32 indexed intervalIdx, bytes32 merkleRoot);
    event EpochChallenged(uint32 indexed zoneId, uint32 indexed intervalIdx, address indexed challenger, string reason);
    event QuorumThresholdUpdated(uint256 oldQuorum, uint256 newQuorum);

    error EpochAlreadyFinalized(uint32 zoneId, uint32 intervalIdx);
    error InsufficientSignatures(uint256 count, uint256 required);
    error DuplicateOrUnsortedSigner(address signer);
    error SignerNotAuthorizedOracle(address signer);
    error EpochNotFound(uint32 zoneId, uint32 intervalIdx);
    error SystemPaused();
    error CallerNotAdmin();

    modifier whenNotPaused() {
        if (accessRegistry.paused()) revert SystemPaused();
        _;
    }

    constructor(address _accessRegistry, uint256 _quorumThreshold) {
        accessRegistry = AccessRegistry(_accessRegistry);
        quorumThreshold = _quorumThreshold;
    }

    function setQuorumThreshold(uint256 _newQuorum) external {
        if (!accessRegistry.hasRole(accessRegistry.DEFAULT_ADMIN_ROLE(), msg.sender)) {
            revert CallerNotAdmin();
        }
        uint256 old = quorumThreshold;
        quorumThreshold = _newQuorum;
        emit QuorumThresholdUpdated(old, _newQuorum);
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
        if (epochs[zoneId][intervalIdx].finalizedAt != 0) {
            revert EpochAlreadyFinalized(zoneId, intervalIdx);
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
            disputed: false
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
        if (epoch.finalizedAt == 0 || epoch.disputed) return false;
        return MerkleProof.verify(merkleProof, epoch.merkleRoot, leafHash);
    }

    function challengeEpoch(
        uint32 zoneId,
        uint32 intervalIdx,
        string calldata reason
    ) external whenNotPaused {
        if (!accessRegistry.hasRole(accessRegistry.AUDITOR_ROLE(), msg.sender)) {
            revert CallerNotAdmin();
        }
        EpochRecord storage epoch = epochs[zoneId][intervalIdx];
        if (epoch.finalizedAt == 0) revert EpochNotFound(zoneId, intervalIdx);
        epoch.disputed = true;
        emit EpochChallenged(zoneId, intervalIdx, msg.sender, reason);
    }

    function getEpoch(uint32 zoneId, uint32 intervalIdx) external view returns (EpochRecord memory) {
        return epochs[zoneId][intervalIdx];
    }
}
