#!/usr/bin/env node
/**
 * grant-operator.js — Grants OPERATOR_ROLE on AccessRegistry to the operator address.
 *
 * Reads:
 *   OPERATOR_PRIVATE_KEY (or OPERATOR_ADDRESS)
 *   DEPLOYER_PRIVATE_KEY (or ADMIN_PRIVATE_KEY) to execute the grantRole transaction
 *   ACCESS_REGISTRY_ADDRESS (optional override, falls back to deployments.json)
 *   RPC_URL (optional override, defaults to Polygon Amoy)
 *
 * Usage:
 *   OPERATOR_PRIVATE_KEY=0x... DEPLOYER_PRIVATE_KEY=0x... node scripts/grant-operator.js
 *
 * Never prints or leaks any private keys.
 */
import { createPublicClient, createWalletClient, http, keccak256, toHex, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygonAmoy, foundry, sepolia } from 'viem/chains';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ACCESS_ABI = [
  {
    type: 'function',
    name: 'hasRole',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'grantRole',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'OPERATOR_ROLE',
    inputs: [],
    outputs: [{ type: 'bytes32' }],
    stateMutability: 'view',
  },
];

function loadDeployment() {
  const p = path.join(__dirname, '..', 'apps', 'web', 'src', 'contracts', 'deployments.json');
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

async function main() {
  const dep = loadDeployment();
  const rpcUrl = process.env.RPC_URL || process.env.VITE_RPC_URL || dep.rpcUrl || 'https://rpc-amoy.polygon.technology';
  const chainId = Number(process.env.CHAIN_ID || process.env.VITE_CHAIN_ID || dep.chainId || 80002);

  const chain =
    chainId === 80002 ? polygonAmoy : chainId === 11155111 ? sepolia : foundry;

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  // 1. Resolve Operator Address
  let operatorAddress = process.env.OPERATOR_ADDRESS;
  if (process.env.OPERATOR_PRIVATE_KEY) {
    try {
      const opAccount = privateKeyToAccount(process.env.OPERATOR_PRIVATE_KEY);
      operatorAddress = opAccount.address;
    } catch (err) {
      console.error('❌ Failed to parse OPERATOR_PRIVATE_KEY:', err.message);
      process.exit(1);
    }
  }

  if (!operatorAddress) {
    console.error('❌ Missing operator identity. Provide either OPERATOR_PRIVATE_KEY or OPERATOR_ADDRESS.');
    process.exit(1);
  }

  operatorAddress = getAddress(operatorAddress);

  // 2. Resolve AccessRegistry Address
  const accessAddress =
    process.env.ACCESS_REGISTRY_ADDRESS ||
    process.env.VITE_ACCESS_REGISTRY_ADDRESS ||
    dep?.contracts?.AccessRegistry?.address;

  if (!accessAddress) {
    console.error('❌ Missing AccessRegistry address. Set ACCESS_REGISTRY_ADDRESS or configure deployments.json.');
    process.exit(1);
  }

  const accessRegistry = getAddress(accessAddress);
  const operatorRoleHash = keccak256(toHex('OPERATOR_ROLE'));

  console.log(`\n========================================`);
  console.log(`VoltMesh — Grant Operator Role On-Chain`);
  console.log(`========================================`);
  console.log(`Network:         Chain ID ${chainId} (${chain.name})`);
  console.log(`RPC URL:         ${rpcUrl}`);
  console.log(`AccessRegistry:  ${accessRegistry}`);
  console.log(`Operator Target: ${operatorAddress}`);
  console.log(`OPERATOR_ROLE:   ${operatorRoleHash}\n`);

  // 3. Check existing role status
  let hasRole = false;
  try {
    hasRole = await publicClient.readContract({
      address: accessRegistry,
      abi: ACCESS_ABI,
      functionName: 'hasRole',
      args: [operatorRoleHash, operatorAddress],
    });
  } catch (err) {
    console.error('❌ Error checking role on AccessRegistry:', err.message);
    process.exit(1);
  }

  if (hasRole) {
    console.log(`✅ Account ${operatorAddress} ALREADY holds OPERATOR_ROLE. No action needed.\n`);
    process.exit(0);
  }

  console.log(`Account ${operatorAddress} does NOT hold OPERATOR_ROLE yet.`);

  // 4. Check for admin/deployer key to grant role
  const adminKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY;
  if (!adminKey) {
    console.log(`\n⚠️  To grant OPERATOR_ROLE, provide DEPLOYER_PRIVATE_KEY or ADMIN_PRIVATE_KEY:\n`);
    console.log(`  OPERATOR_ADDRESS=${operatorAddress} DEPLOYER_PRIVATE_KEY=0x... node scripts/grant-operator.js\n`);
    process.exit(1);
  }

  let adminAccount;
  try {
    adminAccount = privateKeyToAccount(adminKey);
  } catch (err) {
    console.error('❌ Invalid DEPLOYER_PRIVATE_KEY / ADMIN_PRIVATE_KEY:', err.message);
    process.exit(1);
  }

  console.log(`Granting OPERATOR_ROLE via Admin ${adminAccount.address}...`);

  const walletClient = createWalletClient({
    account: adminAccount,
    chain,
    transport: http(rpcUrl),
  });

  try {
    const hash = await walletClient.writeContract({
      address: accessRegistry,
      abi: ACCESS_ABI,
      functionName: 'grantRole',
      args: [operatorRoleHash, operatorAddress],
    });

    console.log(`Transaction submitted: ${hash}`);
    console.log('Waiting for confirmation on-chain...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'success') {
      console.log(`\n✅ Successfully granted OPERATOR_ROLE to ${operatorAddress}!`);
      console.log(`   Block Number: ${receipt.blockNumber}`);
      console.log(`   Tx Hash:      ${receipt.transactionHash}\n`);
      process.exit(0);
    } else {
      console.error(`\n❌ Transaction reverted with status: ${receipt.status}`);
      process.exit(1);
    }
  } catch (err) {
    console.error('\n❌ Failed to execute grantRole on-chain:', err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected failure:', err);
  process.exit(1);
});
