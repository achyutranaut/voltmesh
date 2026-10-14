# VoltMesh Local Devnet Demo Recording Guide

This step-by-step guide walks you through running and recording the full end-to-end **VoltMesh Decentralized Energy Trading Platform** demo on a local Anvil devnet (Chain ID `31337`).

---

## 1. Prerequisites

Make sure the following tools are installed and available in your `$PATH`:
- **Node.js** >= v20
- **pnpm** >= v9 (`npm install -g pnpm`)
- **Foundry** (`anvil`, `forge`, `cast`) — [Install Foundry](https://book.getfoundry.sh/getting-started/installation)
- **MetaMask** browser extension (or 4 separate Chrome profiles with MetaMask installed)

---

## 2. Launching the Local Stack (3 Terminals)

### Terminal 1: Devnet Bootstrap & Contract Deployment
Run the automated bootstrap script. It will kill stale processes on port 8545, start Anvil, deploy all 9 smart contracts, grant on-chain roles, register test participants & devices, seed the current 15-minute epoch, and sync `.env.local` files:
```bash
bash scripts/local-demo.sh
```
*Leave this terminal running in the background. It maintains the Anvil local node.*

### Terminal 2: Start API Server
In a new terminal window:
```bash
cd services/api
pnpm dev
```
*The API will boot on `http://localhost:3000` connected to local Anvil.*

### Terminal 3: Start Web Frontend
In a new terminal window:
```bash
cd apps/web
pnpm dev
```
*The frontend will launch at `http://localhost:5173`.*

---

## 3. MetaMask / Browser Setup

### Network Configuration
Add the local Anvil network to MetaMask:
- **Network Name:** VoltMesh Local Devnet
- **New RPC URL:** `http://127.0.0.1:8545`
- **Chain ID:** `31337`
- **Currency Symbol:** `ETH`

### Import the 4 Demo Accounts
Import the standard Anvil private keys into MetaMask (or distribute across 4 Chrome profiles for instantaneous switching):

| Role | Address | Private Key | Pre-Funded State |
| :--- | :--- | :--- | :--- |
| **Account 1: Regulator** | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` | `REGULATOR_ROLE`, Read-only |
| **Account 2: Operator** | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` | `OPERATOR_ROLE`, Market clearing |
| **Account 4: Seller** | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | `0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a` | `PROSUMER`, 100k vUSD, Solar Device #1 |
| **Account 5: Buyer** | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` | `0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba` | `CONSUMER`, 100k vUSD |

> **Tip:** You can also use the on-screen **"Demo accounts (local devnet)"** one-click login buttons in `apps/web` whenever `VITE_USE_LOCAL=true` and `VITE_CHAIN_ID=31337`.

---

## 4. 2-to-3 Minute Demo Walkthrough Script

Follow these steps while recording your screen:

### Step A: System Overview & Operator Dashboard (0:00 - 0:35)
1. Navigate to `http://localhost:5173`.
2. Connect or switch to **Operator (Account 2)**.
3. Show the dashboard overview:
   - All 9 contracts are detected and verified on chain `31337`.
   - The current 15-minute trading epoch is finalized and active.
   - Point out the active trading zone (Zone 1) and orderbook status.

### Step B: Buyer Bidding with Escrow Shortfall Deposit (0:35 - 1:05)
1. Switch to **Buyer (Account 5)** in MetaMask (or click *Demo Buyer*).
2. Note the pre-minted wallet balance of **100,000 vUSD**.
3. Under the Order Placement card:
   - Select **Side: BUY**.
   - Enter Quantity: **5000 Wh** (5 kWh).
   - Enter Price Limit: **600 paise/kWh** (₹6.00).
4. Observe the smart Escrow validation:
   - The UI checks free escrow balance.
   - If required, it prompts for **Approve & Deposit shortfall** (e.g. 30 vUSD).
   - Approve the transaction and confirm in MetaMask.
5. Sign and place the order. The bid instantly appears in the live orderbook.

### Step C: Seller Listing Energy Ask (1:05 - 1:30)
1. Switch to **Seller (Account 4)** in MetaMask (or click *Demo Seller*).
2. Point out the verified **PROSUMER** status and registered solar generation device.
3. Under Order Placement:
   - Select **Side: SELL**.
   - Enter Quantity: **5000 Wh** (5 kWh).
   - Enter Price Limit: **500 paise/kWh** (₹5.00).
4. Click **Submit Energy Ask**. Confirm the SIWE order signature.
5. The bid and ask now overlap in the orderbook, ready for uniform clearing.

### Step D: Operator Market Clearing & Auction Settlement (1:30 - 2:00)
1. Switch back to **Operator (Account 2)** (or click *Demo Operator*).
2. Navigate to the Market Operations / Clearing panel.
3. Click **"Clear Market Interval"**:
   - The uniform clearing engine runs off-chain.
   - Computes market clearing price (e.g., **550 paise/kWh**).
   - Clears 5,000 Wh of renewable energy.
   - Generates the obligations Merkle tree root.
   - The backend submits `commitClearing` on-chain with `OPERATOR_PRIVATE_KEY`.
4. Point out the on-chain Clearing Commitment transaction and Merkle root.

### Step E: Escrow Balance & Settlement Verification (2:00 - 2:25)
1. Switch to **Seller (Account 4)**:
   - Check Escrow balance: The delivered energy proceeds are credited directly to the Seller's free escrow balance.
2. In the Escrow panel, click **"Withdraw Earnings"**:
   - Confirm transaction in MetaMask.
   - Show the Seller's wallet token balance increase in real time.
3. Switch to **Buyer (Account 5)**:
   - Show that only the cleared clearing price was deducted from Escrow, with any unused deposit remaining fully liquid.

### Step F: Regulator Read-Only Compliance & Oversight (2:25 - 3:00)
1. Switch to **Regulator (Account 1)** (or click *Demo Regulator*).
2. Show the Regulator Audit & Governance View:
   - Live settlement statements and Merkle proofs.
   - Device attestations and grid compliance reports.
   - Notice that every mutation button (Trade, Clear, Settle, Withdraw) is **disabled or hidden**.
3. Explain the regulatory oversight boundary: The regulator has cryptographic read access to all audits and books without possessing operational trading or execution authority.

---

## 5. Automated Health & Smoke Testing

To verify the entire 8-step flow automatically before recording:
```bash
bash scripts/local-smoke.sh
```
This runs 8 automated assertions:
1. Backend health & operator address verification
2. SIWE authentication for all 4 roles
3. Buyer shortfall deposit & bid placement
4. Seller ask listing
5. Operator call auction clearing & Merkle commitment
6. On-chain obligation settlement & Escrow credit
7. Seller earnings withdrawal to wallet
8. Regulator clearing attempt returning strict `403 Forbidden`

---

## 6. Epoch Refresh Helper

If you leave the devnet running and the 15-minute interval expires, re-seed the current epoch with:
```bash
bash scripts/reseed-epoch.sh
```
