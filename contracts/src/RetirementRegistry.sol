// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AccessRegistry.sol";
import "./CertificateRegistry.sol";

/**
 * @title RetirementRegistry
 * @notice Enforces single-use permanent retirement of Granular Attestation Certificates (GACs).
 *         Prevents double counting and records beneficiaries and audit purposes permanently on-chain.
 */
contract RetirementRegistry {
    AccessRegistry public immutable accessRegistry;
    CertificateRegistry public immutable certificateRegistry;

    // nullifier => isRetired
    mapping(bytes32 => bool) public retiredNullifiers;

    event CertificateRetired(
        address indexed account,
        uint256 indexed tokenId,
        uint64 amountWh,
        bytes32 indexed nullifier,
        string beneficiary,
        string purpose
    );

    error NullifierAlreadySpent(bytes32 nullifier);
    error InvalidRetirementAmount();
    error SystemPaused();

    modifier whenNotPaused() {
        if (accessRegistry.paused()) revert SystemPaused();
        _;
    }

    constructor(address _accessRegistry, address _certificateRegistry) {
        accessRegistry = AccessRegistry(_accessRegistry);
        certificateRegistry = CertificateRegistry(_certificateRegistry);
    }

    function retire(
        uint256 tokenId,
        uint64 amountWh,
        string calldata beneficiary,
        string calldata purpose
    ) external whenNotPaused returns (bytes32 nullifier) {
        if (amountWh == 0) revert InvalidRetirementAmount();

        nullifier = keccak256(
            abi.encodePacked(
                msg.sender,
                tokenId,
                amountWh,
                beneficiary,
                purpose
            )
        );

        if (retiredNullifiers[nullifier]) revert NullifierAlreadySpent(nullifier);
        retiredNullifiers[nullifier] = true;

        certificateRegistry.burnForRetirement(msg.sender, tokenId, amountWh);

        emit CertificateRetired(msg.sender, tokenId, amountWh, nullifier, beneficiary, purpose);
        return nullifier;
    }
}
