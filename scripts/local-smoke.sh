#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Ensure anvil is reachable
if ! cast block-number --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1; then
  echo "ERROR: Anvil local node is not running on http://127.0.0.1:8545."
  echo "       Please run: bash scripts/local-demo.sh first."
  exit 1
fi

# Ensure contracts are deployed
if [ ! -f "${ROOT_DIR}/contracts/deployments/local.json" ]; then
  echo "ERROR: contracts/deployments/local.json not found."
  echo "       Please run: bash scripts/local-demo.sh first."
  exit 1
fi

STARTED_BACKEND=false
BACKEND_PID=""

cleanup() {
  if [ "${STARTED_BACKEND}" = true ] && [ -n "${BACKEND_PID}" ]; then
    echo "Stopping background backend process (PID ${BACKEND_PID})..."
    kill -9 "${BACKEND_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Check if backend is running on port 3000
if ! curl -sf http://localhost:3000/health >/dev/null 2>&1; then
  echo "Backend API is not running on port 3000. Starting local backend in background..."
  cd "${ROOT_DIR}/services/api"
  pnpm dev > "${ROOT_DIR}/logs/api-smoke.log" 2>&1 &
  BACKEND_PID=$!
  STARTED_BACKEND=true
  cd "${ROOT_DIR}"

  echo "Waiting for backend to become ready on http://localhost:3000/health..."
  RETRIES=30
  while ! curl -sf http://localhost:3000/health >/dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -le 0 ]; then
      echo "ERROR: Timed out waiting for backend API to start. Check logs/api-smoke.log."
      exit 1
    fi
    sleep 0.5
  done
  echo "Backend is ready (PID: ${BACKEND_PID})."
fi

# Run the 8-step smoke test
node "${SCRIPT_DIR}/local-smoke.cjs"
