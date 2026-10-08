# VoltMesh Smart Contracts

Foundry-based smart contract suite for the VoltMesh decentralized peer-to-peer energy trading platform.

- **Solidity Version**: `0.8.24` (with `cancun` EVM target)
- **Framework**: [Foundry](https://getfoundry.sh/) (`forge`, `cast`, `anvil`)
- **Dependencies**: OpenZeppelin Contracts v5.7 (`@openzeppelin/contracts`)

---

## Contract Architecture

| Contract | Purpose |
| :--- | :--- |
| `ParticipantRegistry.sol` | Manages participant registration, KYC/role bindings, and suspension controls. |
| `DeviceRegistry.sol` | Tracks hardware smart meters, cryptographic public keys, and anti-equivocation nonces. |
| `AccessRegistry.sol` | Timelocked role-based access control (RBAC) governance for protocol operations. |
| `EpochOracle.sol` | Collects 3-node oracle quorum signatures, canonical Merkle roots, and handles 30-day challenge windows. |
| `BatchSettlement.sol` | Verifies cleared uniform-price auction batches, commits trade vectors, and handles keeper-assisted creditor/debtor payouts. |
| `Escrow.sol` | Solvency-preserving multi-party escrow locking buyer collateral, enforcing strict delivery verification deadlines, and executing atomic balance transfers. |
| `Certificates.sol` | ERC-1155 prototype granular attestation certificate (GAC) minting, transfers, and retirement tracking. |
| `VoltToken.sol` | ERC-20 test settlement token with faucet functionality for development environments. |

---

## Invariant Guarantees & Security

The suite is hardened with property-based testing and stateful invariant fuzzing:

1. **Escrow Solvency (`EscrowInvariant.t.sol`)**:
   - `locked <= balance`: User locked collateral never exceeds deposited balance.
   - `totalEscrowed == sum(deposits)`: Conservation of value across all deposits, withdrawals, and settlements.
   - `tokenBackedBySupply`: The Escrow token balance equals aggregate tracked user balances.
   - Run configuration: `runs = 256`, `depth = 64`, `fail_on_revert = true`.

2. **Settlement Solvency (`BatchSettlementInvariant.t.sol`)**:
   - Total creditor payouts never exceed net debtor collections (`sum(payouts) <= sum(collections)`).
   - Zero net leakage and strict token conservation during multilateral batch clearing.

3. **Merkle Verification**:
   - Leaf prefixing adheres to RFC 6962 (`0x00`), and internal nodes use OpenZeppelin sorted-pair hashing (`keccak256(a < b ? abi.encodePacked(a, b) : abi.encodePacked(b, a))`).
   - Cross-language parity is verified against TypeScript fixtures in `MerkleGoldenVectors.t.sol`.

---

## Build & Test Instructions

### 1. Install Dependencies

```bash
forge install
```

### 2. Build Contracts

```bash
forge build --sizes
```

### 3. Run Test Suite

```bash
# Run all unit tests, fuzz tests, invariant tests, and security attack simulations
forge test

# Run tests with detailed traces
forge test -vvv

# Run invariant tests specifically
forge test --match-contract Invariant
```

---

## Local Deployment (Anvil)

To deploy contracts to a local Anvil instance:

```bash
# 1. Start Anvil in a background terminal
anvil

# 2. Deploy contracts using Foundry deployment script
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```
