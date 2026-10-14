#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=================================================================="
echo "          VoltMesh — Local Devnet One-Command Setup               "
echo "=================================================================="

# Check requirements
for cmd in anvil forge cast node pnpm; do
  if ! command -v "$cmd" &> /dev/null; then
    echo "ERROR: Required tool '$cmd' is not installed or not in PATH."
    exit 1
  fi
done

# 1. Kill any existing anvil or node process on port 8545
echo ""
echo "[1/5] Checking port 8545..."
if lsof -ti:8545 >/dev/null 2>&1; then
  echo "      Port 8545 in use. Terminating existing process..."
  lsof -ti:8545 | xargs kill -9 2>/dev/null || true
  sleep 1
  echo "      Existing process on port 8545 terminated."
else
  echo "      Port 8545 is available."
fi

# 2. Start anvil in background (chain id 31337, port 8545)
echo ""
echo "[2/5] Starting Anvil local node (Chain ID: 31337, Port: 8545)..."
mkdir -p "${ROOT_DIR}/logs"
anvil --chain-id 31337 --port 8545 > "${ROOT_DIR}/logs/anvil.log" 2>&1 &
ANVIL_PID=$!
echo "      Anvil process launched (PID: ${ANVIL_PID}). Log: logs/anvil.log"

# Wait for Anvil to be responsive
echo "      Waiting for Anvil JSON-RPC to respond..."
RETRIES=30
while ! cast block-number --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [ $RETRIES -le 0 ]; then
    echo "ERROR: Timed out waiting for Anvil to respond on http://127.0.0.1:8545."
    exit 1
  fi
  sleep 0.2
done
echo "      Anvil node is active (Current block: $(cast block-number --rpc-url http://127.0.0.1:8545))."

# 3. Deploy VoltMesh contracts via Foundry
echo ""
echo "[3/5] Deploying VoltMesh contracts (contracts/script/Deploy.s.sol)..."
cd "${ROOT_DIR}/contracts"
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast > "${ROOT_DIR}/logs/deploy.log" 2>&1
cd "${ROOT_DIR}"

DEPLOY_FILE="${ROOT_DIR}/contracts/deployments/local.json"
if [ ! -f "${DEPLOY_FILE}" ]; then
  echo "ERROR: Deployed file ${DEPLOY_FILE} was not created. Check logs/deploy.log."
  exit 1
fi
echo "      Contracts successfully deployed on chain 31337."

# 4. Generate apps/web/.env.local and services/api/.env.local
echo ""
echo "[4/5] Syncing environment configuration..."
node "${SCRIPT_DIR}/sync-local-env.cjs"

# 5. Seed the current 15-minute epoch
echo ""
echo "[5/5] Seeding current 15-minute interval epoch..."
bash "${SCRIPT_DIR}/reseed-epoch.sh"

echo ""
echo "=================================================================="
echo "             VoltMesh Local Devnet Setup Complete!                "
echo "=================================================================="

node -e '
const fs = require("fs");
const path = require("path");
const d = JSON.parse(fs.readFileSync(path.resolve("contracts/deployments/local.json"), "utf8"));
console.log("\n[DEPLOYED CONTRACTS]");
for (const [k, v] of Object.entries(d)) {
  if (k !== "chainId") console.log(`  ${k.padEnd(24)}: ${v}`);
}
'

echo ""
echo "[DEMO WALLETS (Anvil Public Dev Accounts)]"
echo "------------------------------------------------------------------"
echo "1. SELLER (Prosumer with 10kW Solar Meter & vUSD Tokens):"
echo "   Address:     0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"
echo "   Private Key: 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"
echo "   Balance:     10,000 ETH | 100,000 vUSD"
echo ""
echo "2. BUYER (Commercial Consumer with vUSD Tokens):"
echo "   Address:     0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"
echo "   Private Key: 0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba"
echo "   Balance:     10,000 ETH | 100,000 vUSD"
echo ""
echo "3. OPERATOR (DISCOM Market Operator - Clears Call Auction):"
echo "   Address:     0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
echo "   Private Key: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
echo "   Role:        OPERATOR_ROLE (can call commitClearing on-chain)"
echo ""
echo "4. REGULATOR (State Regulatory Commission / Auditor):"
echo "   Address:     0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
echo "   Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
echo "   Role:        REGULATOR_ROLE + AUDITOR_ROLE (Read-only, no trades)"
echo "------------------------------------------------------------------"
echo ""
echo "[METAMASK NETWORK CONFIGURATION]"
echo "  Network Name:   VoltMesh Local Devnet"
echo "  New RPC URL:    http://127.0.0.1:8545"
echo "  Chain ID:       31337"
echo "  Currency:       ETH"
echo ""
echo "[HOW TO RUN THE APPLICATION]"
echo "  Terminal 1 (Backend API):"
echo "    pnpm --filter @energy-dex/api dev"
echo ""
echo "  Terminal 2 (Frontend Web):"
echo "    pnpm --filter @energy-dex/web dev"
echo ""
echo "  Terminal 3 (Run Automated Smoke Test):"
echo "    bash scripts/local-smoke.sh"
echo "=================================================================="
