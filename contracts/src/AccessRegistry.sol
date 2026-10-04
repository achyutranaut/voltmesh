// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/access/IAccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title AccessRegistry
 * @notice Central access control and pause coordinator for the Decentralized Energy Exchange.
 */
contract AccessRegistry is AccessControlEnumerable, Pausable {
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant TIMELOCK_DELAY = 1 days;

    struct RoleProposal {
        bytes32 role;
        address account;
        uint256 executeAfter;
        bool executed;
    }

    mapping(bytes32 => RoleProposal) public proposals;

    event RoleProposed(bytes32 indexed proposalId, bytes32 indexed role, address indexed account, uint256 executeAfter);
    event RoleProposalExecuted(bytes32 indexed proposalId, bytes32 indexed role, address indexed account);
    event RoleProposalCancelled(bytes32 indexed proposalId);

    error ProposalNotReady(uint256 currentTime, uint256 executeAfter);
    error ProposalAlreadyExecuted();
    error ProposalDoesNotExist();

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    function proposeRoleGrant(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) returns (bytes32) {
        bytes32 proposalId = keccak256(abi.encodePacked(role, account, block.timestamp));
        proposals[proposalId] = RoleProposal({
            role: role,
            account: account,
            executeAfter: block.timestamp + TIMELOCK_DELAY,
            executed: false
        });

        emit RoleProposed(proposalId, role, account, block.timestamp + TIMELOCK_DELAY);
        return proposalId;
    }

    function executeRoleGrant(bytes32 proposalId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        RoleProposal storage proposal = proposals[proposalId];
        if (proposal.executeAfter == 0) revert ProposalDoesNotExist();
        if (proposal.executed) revert ProposalAlreadyExecuted();
        if (block.timestamp < proposal.executeAfter) {
            revert ProposalNotReady(block.timestamp, proposal.executeAfter);
        }

        proposal.executed = true;
        _grantRole(proposal.role, proposal.account);
        emit RoleProposalExecuted(proposalId, proposal.role, proposal.account);
    }

    bool public directGrantsDisabled;

    event DirectGrantsDisabled();
    error DirectGrantDisabled();

    /**
     * @notice Locks direct role grants permanently, requiring all future grants to go through timelock.
     */
    function disableDirectGrants() external onlyRole(DEFAULT_ADMIN_ROLE) {
        directGrantsDisabled = true;
        emit DirectGrantsDisabled();
    }

    /**
     * @notice Overrides OpenZeppelin grantRole to enforce timelock once direct grants are disabled.
     */
    function grantRole(bytes32 role, address account) public override(AccessControl, IAccessControl) {
        if (directGrantsDisabled) {
            revert DirectGrantDisabled();
        }
        super.grantRole(role, account);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
