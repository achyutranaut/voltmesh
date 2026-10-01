// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./AccessRegistry.sol";
import "./ParticipantRegistry.sol";
import "./EpochOracle.sol";
import "./Escrow.sol";

/**
 * @title BatchSettlement
 * @notice Commits off-chain interval clearing commitments and processes T+1 daily settlement claims.
 */
contract BatchSettlement {
    bytes1 public constant STATEMENT_PREFIX = 0x02;

    AccessRegistry public immutable accessRegistry;
    ParticipantRegistry public immutable participantRegistry;
    EpochOracle public immutable epochOracle;
    Escrow public immutable escrow;

    struct ClearingCommitment {
        uint32 zoneId;
        uint32 intervalIdx;
        uint64 clearingPricePaiseKWh;
        uint64 totalVolumeWh;
        bytes32 ordersMerkleRoot;
        bytes32 obligationsMerkleRoot;
        uint64 committedAt;
    }

    struct DailyStatement {
        uint32 dateEpoch;
        uint32 zoneId;
        bytes32 statementRoot;
        uint256 totalCreditsPaise;
        uint256 totalDebitsPaise;
        uint64 postedAt;
    }

    // zoneId => intervalIdx => ClearingCommitment
    mapping(uint32 => mapping(uint32 => ClearingCommitment)) public commitments;

    // dateEpoch => zoneId => DailyStatement
    mapping(uint32 => mapping(uint32 => DailyStatement)) public dailyStatements;

    // leafNullifier => isClaimed
    mapping(bytes32 => bool) public claimedLeaves;

    event ClearingCommitted(
        uint32 indexed zoneId,
        uint32 indexed intervalIdx,
        uint64 pricePaiseKWh,
        uint64 volumeWh,
        bytes32 obligationsRoot
    );
    event DailyStatementPosted(
        uint32 indexed dateEpoch,
        uint32 indexed zoneId,
        bytes32 statementRoot,
        uint256 totalCredits,
        uint256 totalDebits
    );
    event SettlementClaimed(
        address indexed participant,
        uint32 indexed dateEpoch,
        uint32 indexed zoneId,
        int256 netAmountPaise,
        uint32 leafIndex
    );

    error CallerNotOperator();
    error CommitmentAlreadyExists(uint32 zoneId, uint32 intervalIdx);
    error StatementAlreadyPosted(uint32 dateEpoch, uint32 zoneId);
    error StatementNotFound(uint32 dateEpoch, uint32 zoneId);
    error LeafAlreadyClaimed(bytes32 nullifier);
    error InvalidMerkleProof();
    error ParticipantNotActive(address participant);
    error SystemPaused();

    modifier onlyOperator() {
        if (!accessRegistry.hasRole(accessRegistry.OPERATOR_ROLE(), msg.sender)) {
            revert CallerNotOperator();
        }
        _;
    }

    modifier whenNotPaused() {
        if (accessRegistry.paused()) revert SystemPaused();
        _;
    }

    constructor(
        address _accessRegistry,
        address _participantRegistry,
        address _epochOracle,
        address payable _escrow
    ) {
        accessRegistry = AccessRegistry(_accessRegistry);
        participantRegistry = ParticipantRegistry(_participantRegistry);
        epochOracle = EpochOracle(_epochOracle);
        escrow = Escrow(_escrow);
    }

    function commitClearing(
        uint32 zoneId,
        uint32 intervalIdx,
        uint64 clearingPricePaiseKWh,
        uint64 totalVolumeWh,
        bytes32 ordersMerkleRoot,
        bytes32 obligationsMerkleRoot
    ) external onlyOperator whenNotPaused {
        if (commitments[zoneId][intervalIdx].committedAt != 0) {
            revert CommitmentAlreadyExists(zoneId, intervalIdx);
        }

        commitments[zoneId][intervalIdx] = ClearingCommitment({
            zoneId: zoneId,
            intervalIdx: intervalIdx,
            clearingPricePaiseKWh: clearingPricePaiseKWh,
            totalVolumeWh: totalVolumeWh,
            ordersMerkleRoot: ordersMerkleRoot,
            obligationsMerkleRoot: obligationsMerkleRoot,
            committedAt: uint64(block.timestamp)
        });

        emit ClearingCommitted(zoneId, intervalIdx, clearingPricePaiseKWh, totalVolumeWh, obligationsMerkleRoot);
    }

    function postDailyStatement(
        uint32 dateEpoch,
        uint32 zoneId,
        bytes32 statementRoot,
        uint256 totalCreditsPaise,
        uint256 totalDebitsPaise
    ) external onlyOperator whenNotPaused {
        if (dailyStatements[dateEpoch][zoneId].postedAt != 0) {
            revert StatementAlreadyPosted(dateEpoch, zoneId);
        }

        dailyStatements[dateEpoch][zoneId] = DailyStatement({
            dateEpoch: dateEpoch,
            zoneId: zoneId,
            statementRoot: statementRoot,
            totalCreditsPaise: totalCreditsPaise,
            totalDebitsPaise: totalDebitsPaise,
            postedAt: uint64(block.timestamp)
        });

        emit DailyStatementPosted(dateEpoch, zoneId, statementRoot, totalCreditsPaise, totalDebitsPaise);
    }

    function claimSettlement(
        uint32 dateEpoch,
        uint32 zoneId,
        int256 netAmountPaise,
        uint64 deliveredWh,
        uint64 shortfallWh,
        uint64 shortfallPenaltyPaise,
        uint32 leafIndex,
        bytes32[] calldata merkleProof
    ) external whenNotPaused {
        if (!participantRegistry.isRegisteredAndActive(msg.sender)) {
            revert ParticipantNotActive(msg.sender);
        }

        DailyStatement storage stmt = dailyStatements[dateEpoch][zoneId];
        if (stmt.postedAt == 0) revert StatementNotFound(dateEpoch, zoneId);

        bytes32 nullifier = keccak256(abi.encodePacked(dateEpoch, zoneId, leafIndex));
        if (claimedLeaves[nullifier]) revert LeafAlreadyClaimed(nullifier);

        bytes32 leafHash = keccak256(
            abi.encodePacked(
                STATEMENT_PREFIX,
                msg.sender,
                dateEpoch,
                netAmountPaise,
                deliveredWh,
                shortfallWh,
                shortfallPenaltyPaise,
                leafIndex
            )
        );

        if (!MerkleProof.verify(merkleProof, stmt.statementRoot, leafHash)) {
            revert InvalidMerkleProof();
        }

        claimedLeaves[nullifier] = true;

        // If netAmountPaise > 0, execute settlement release/transfer
        // (paise to wei / test token 1:1 in sandbox)
        if (netAmountPaise > 0) {
            // Funds released from escrow settlement pool to participant
            escrow.executeSettlementTransfer(address(this), msg.sender, uint256(netAmountPaise));
        }

        emit SettlementClaimed(msg.sender, dateEpoch, zoneId, netAmountPaise, leafIndex);
    }
}
