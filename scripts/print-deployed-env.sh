#!/usr/bin/env bash
set -euo pipefail

# Resolves repo root relative to this script so it works from any working directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOYMENT_FILE="${1:-$REPO_ROOT/contracts/deployments/amoy.json}"

if [ ! -f "$DEPLOYMENT_FILE" ]; then
  echo "Error: Deployment file not found: $DEPLOYMENT_FILE" >&2
  echo "Run deployment script first to generate it (e.g. forge script script/DeployAmoy.s.sol:DeployAmoy)." >&2
  exit 1
fi

node -e '
const fs = require("fs");
const filePath = process.argv[1];

let data;
try {
  data = JSON.parse(fs.readFileSync(filePath, "utf8"));
} catch (err) {
  console.error(`Error parsing ${filePath}: ${err.message}`);
  process.exit(1);
}

const HEX_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

// Verify that values are safe public addresses / numbers and contain no secret keys
for (const [key, value] of Object.entries(data)) {
  if (key === "chainId") {
    if (typeof value !== "number" && !/^\d+$/.test(value)) {
      console.error(`Security check failed: Invalid chainId "${value}".`);
      process.exit(1);
    }
  } else if (typeof value === "string") {
    if (!HEX_ADDRESS_REGEX.test(value)) {
      console.error(`Security check failed: key "${key}" is not a valid 20-byte address.`);
      process.exit(1);
    }
  }
}

const get = (k) => data[k] || "";
const chainId = data.chainId || 80002;

console.log("==== COPY INTO VERCEL (frontend) ====");
console.log(`VITE_CHAIN_ID=${chainId}`);
console.log(`VITE_ACCESS_REGISTRY_ADDRESS=${get("AccessRegistry")}`);
console.log(`VITE_PARTICIPANT_REGISTRY_ADDRESS=${get("ParticipantRegistry")}`);
console.log(`VITE_DEVICE_REGISTRY_ADDRESS=${get("DeviceRegistry")}`);
console.log(`VITE_EPOCH_ORACLE_ADDRESS=${get("EpochOracle")}`);
console.log(`VITE_MOCK_ERC20_ADDRESS=${get("MockERC20")}`);
console.log(`VITE_ESCROW_ADDRESS=${get("Escrow")}`);
console.log(`VITE_BATCH_SETTLEMENT_ADDRESS=${get("BatchSettlement")}`);
console.log(`VITE_CERTIFICATE_REGISTRY_ADDRESS=${get("CertificateRegistry")}`);
console.log(`VITE_RETIREMENT_REGISTRY_ADDRESS=${get("RetirementRegistry")}`);
console.log("");
console.log("==== COPY INTO RAILWAY (backend) ====");
console.log(`CHAIN_ID=${chainId}`);
console.log(`ACCESS_REGISTRY_ADDRESS=${get("AccessRegistry")}`);
console.log(`PARTICIPANT_REGISTRY_ADDRESS=${get("ParticipantRegistry")}`);
console.log(`DEVICE_REGISTRY_ADDRESS=${get("DeviceRegistry")}`);
console.log(`EPOCH_ORACLE_ADDRESS=${get("EpochOracle")}`);
console.log(`BATCH_SETTLEMENT_ADDRESS=${get("BatchSettlement")}`);
console.log(`MOCK_ERC20_ADDRESS=${get("MockERC20")}`);
console.log(`ESCROW_ADDRESS=${get("Escrow")}`);
console.log(`CERTIFICATE_REGISTRY_ADDRESS=${get("CertificateRegistry")}`);
console.log(`RETIREMENT_REGISTRY_ADDRESS=${get("RetirementRegistry")}`);
' "$DEPLOYMENT_FILE"
