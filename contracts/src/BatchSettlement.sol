// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./AccessRegistry.sol";
import "./ParticipantRegistry.sol";
import "./EpochOracle.sol";
import "./Escrow.sol";

/**
 * @title BatchSettlement
 * @notice Commits off-chain interval clearing commitments and processes T+1 daily settlement claims.
 */
contract BatchSettlement {
    using SafeERC20 for IERC20;

    bytes1 public constant STATEMENT_PREFIX = 0x02;

    AccessRegistry public immutable accessRegistry;
    ParticipantRegistry public immutable participantRegistry;
    EpochOracle public immutable epochOracle;
    Escrow public immutable escrow;

    bytes32 public constant ENERGY_ORDER_TYPEHASH = keccak256(
        "EnergyOrder(address maker,uint32 zone,uint32 interval,uint8 side,uint64 quantityWh,uint64 pricePaisePerKWh,uint256 nonce,uint256 expiry)"
    );
    bytes32 public immutable DOMAIN_SEPARATOR;

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

    // participant => nonce => isCancelled
    mapping(address => mapping(uint256 => bool)) public cancelledNonces;

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
    event OrderCancelled(address indexed participant, uint256 indexed nonce);
    event SettlementPoolFunded(address indexed funder, uint256 amount);

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

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("VoltMesh Energy Exchange")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
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

    /**
     * @notice Cancels an order on-chain using its nonce to prevent matching or settlement inclusion.
     */
    function cancelOrder(uint256 nonce) external whenNotPaused {
        if (!participantRegistry.isRegisteredAndActive(msg.sender)) {
            revert ParticipantNotActive(msg.sender);
        }
        cancelledNonces[msg.sender][nonce] = true;
        emit OrderCancelled(msg.sender, nonce);
    }

    function isOrderCancelled(address participant, uint256 nonce) external view returns (bool) {
        return cancelledNonces[participant][nonce];
    }

    /**
     * @notice Computes EIP-712 typed order hash for off-chain order verification and cancellation.
     */
    function hashEnergyOrder(
        address maker,
        uint32 zone,
        uint32 interval,
        uint8 side,
        uint64 quantityWh,
        uint64 pricePaisePerKWh,
        uint256 nonce,
        uint256 expiry
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                ENERGY_ORDER_TYPEHASH,
                maker,
                zone,
                interval,
                side,
                quantityWh,
                pricePaisePerKWh,
                nonce,
                expiry
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    /**
     * @notice Locks collateral in Escrow for a cleared bilateral delivery obligation.
     */
    function lockObligation(
        bytes32 obligationId,
        address buyer,
        address seller,
        uint256 amount,
        uint32 zoneId,
        uint32 intervalIdx
    ) external onlyOperator whenNotPaused {
        escrow.lockObligationCollateral(obligationId, buyer, seller, amount, zoneId, intervalIdx);
    }

    /**
     * @notice Settles a verified obligation by releasing buyer collateral directly to seller.
     */
    function settleObligation(
        bytes32 obligationId,
        uint256 settleAmount
    ) external onlyOperator whenNotPaused {
        escrow.settleObligation(obligationId, settleAmount);
    }

    /**
     * @notice Refunds a failed or unfulfilled obligation back to the buyer's free escrow balance.
     */
    function refundObligation(
        bytes32 obligationId
    ) external onlyOperator whenNotPaused {
        escrow.refundObligation(obligationId);
    }

    /**
     * @notice Deposits funds directly into Escrow under the settlement contract's balance.
     */
    function fundSettlementPool(uint256 amount) external whenNotPaused {
        IERC20 token = escrow.paymentToken();
        token.safeTransferFrom(msg.sender, address(this), amount);
        token.forceApprove(address(escrow), amount);
        escrow.deposit(amount);
        emit SettlementPoolFunded(msg.sender, amount);
    }
}
