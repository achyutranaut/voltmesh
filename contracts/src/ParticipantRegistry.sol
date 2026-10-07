// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AccessRegistry.sol";

/**
 * @title ParticipantRegistry
 * @notice Manages prosumer/consumer identities, grid zone associations, and DISCOM binding hashes.
 */
contract ParticipantRegistry {
    AccessRegistry public immutable accessRegistry;

    enum RoleType { CONSUMER, PROSUMER, DISCOM_OPERATOR }

    struct Participant {
        bytes32 participantId;
        uint32 zoneId;
        RoleType roleType;
        bytes32 bindingHash;
        bool isSuspended;
        uint64 registeredAt;
    }

    mapping(address => Participant) public participants;
    mapping(bytes32 => address) public bindingHashToWallet;
    mapping(bytes32 => address) public participantIdToWallet;

    event ParticipantRegistered(
        address indexed wallet,
        bytes32 indexed participantId,
        uint32 indexed zoneId,
        bytes32 bindingHash,
        RoleType roleType
    );
    event ParticipantSuspended(address indexed wallet);
    event ParticipantReactivated(address indexed wallet);
    event ParticipantZoneUpdated(address indexed wallet, uint32 oldZone, uint32 newZone);

    error CallerNotRegistrar();
    error ParticipantAlreadyRegistered(address wallet);
    error BindingHashAlreadyBound(bytes32 bindingHash, address existingWallet);
    error ParticipantIdAlreadyBound(bytes32 participantId, address existingWallet);
    error ParticipantNotFound(address wallet);
    error ParticipantIsSuspended(address wallet);
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

    function registerParticipant(
        address wallet,
        bytes32 participantId,
        uint32 zoneId,
        RoleType roleType,
        bytes32 bindingHash
    ) external onlyRegistrar whenNotPaused {
        if (participants[wallet].registeredAt != 0) {
            revert ParticipantAlreadyRegistered(wallet);
        }
        if (bindingHashToWallet[bindingHash] != address(0)) {
            revert BindingHashAlreadyBound(bindingHash, bindingHashToWallet[bindingHash]);
        }
        if (participantIdToWallet[participantId] != address(0)) {
            revert ParticipantIdAlreadyBound(participantId, participantIdToWallet[participantId]);
        }

        participants[wallet] = Participant({
            participantId: participantId,
            zoneId: zoneId,
            roleType: roleType,
            bindingHash: bindingHash,
            isSuspended: false,
            registeredAt: uint64(block.timestamp)
        });

        bindingHashToWallet[bindingHash] = wallet;
        participantIdToWallet[participantId] = wallet;

        emit ParticipantRegistered(wallet, participantId, zoneId, bindingHash, roleType);
    }

    function suspendParticipant(address wallet) external onlyRegistrar {
        Participant storage p = participants[wallet];
        if (p.registeredAt == 0) revert ParticipantNotFound(wallet);
        p.isSuspended = true;
        emit ParticipantSuspended(wallet);
    }

    function reactivateParticipant(address wallet) external onlyRegistrar {
        Participant storage p = participants[wallet];
        if (p.registeredAt == 0) revert ParticipantNotFound(wallet);
        p.isSuspended = false;
        emit ParticipantReactivated(wallet);
    }

    function updateZone(address wallet, uint32 newZoneId) external onlyRegistrar whenNotPaused {
        Participant storage p = participants[wallet];
        if (p.registeredAt == 0) revert ParticipantNotFound(wallet);
        uint32 oldZone = p.zoneId;
        p.zoneId = newZoneId;
        emit ParticipantZoneUpdated(wallet, oldZone, newZoneId);
    }

    function isRegisteredAndActive(address wallet) external view returns (bool) {
        Participant storage p = participants[wallet];
        return p.registeredAt != 0 && !p.isSuspended;
    }

    function getParticipantByWallet(address wallet) external view returns (Participant memory) {
        return participants[wallet];
    }
}
