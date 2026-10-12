#!/usr/bin/env node
/**
 * verify-roles.js — Print the on-chain roles of the demo wallets and FAIL loudly
 * on any mismatch against the expected role set.
 *
 * Reads deployed addresses from apps/web/src/contracts/deployments.json (or overrides
 * via env). Queries AccessRegistry.hasRole + ParticipantRegistry for REGULATOR,
 * OPERATOR, SELLER, BUYER addresses.
 *
 * Usage:
 *   RPC_URL=... REGULATOR_ADDRESS=0x.. OPERATOR_ADDRESS=0x.. SELLER_ADDRESS=0x.. BUYER_ADDRESS=0x.. \
 *   node scripts/verify-roles.js
 *
 * Never prints or requires any private key.
 */
import { createPublicClient, http, keccak256, toHex, getAddress } from 'viem';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROLE_ABI = [
  { type: 'function', name: 'hasRole', inputs: [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
];
const PARTICIPANT_ABI = [
  {
    type: 'function', name: 'participants', inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [
      { name: 'participantId', type: 'bytes32' },
      { name: 'zoneId', type: 'uint32' },
      { name: 'roleType', type: 'uint8' },
      { name: 'bindingHash', type: 'bytes32' },
      { name: 'isSuspended', type: 'bool' },
      { name: 'registeredAt', type: 'uint64' },
    ], stateMutability: 'view',
  },
];

function loadDeployment() {
  const p = path.join(__dirname, '..', 'apps', 'web', 'src', 'contracts', 'deployments.json');
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  return {};
}

const dep = loadDeployment();
const RPC_URL = process.env.RPC_URL || dep.rpcUrl;
const contracts = dep?.contracts || {};
const accessAddr = process.env.ACCESS_REGISTRY_ADDRESS || contracts?.AccessRegistry?.address;
const participantAddr = process.env.PARTICIPANT_REGISTRY_ADDRESS || contracts?.ParticipantRegistry?.address;

const ACCOUNTS = {
  REGULATOR: process.env.REGULATOR_ADDRESS,
  OPERATOR: process.env.OPERATOR_ADDRESS,
  SELLER: process.env.SELLER_ADDRESS,
  BUYER: process.env.BUYER_ADDRESS,
};

function fail(msg) {
  console.error(`\n\u274c ${msg}`);
  process.exitCode = 1;
}

if (!RPC_URL || !accessAddr) {
  console.error('Missing RPC_URL / ACCESS_REGISTRY_ADDRESS (or deployments.json).');
  process.exit(1);
}

const client = createPublicClient({ transport: http(RPC_URL) });

const ROLES = {
  OPERATOR_ROLE: keccak256(toHex('OPERATOR_ROLE')),
  REGULATOR_ROLE: keccak256(toHex('REGULATOR_ROLE')),
  AUDITOR_ROLE: keccak256(toHex('AUDITOR_ROLE')),
  ORACLE_ROLE: keccak256(toHex('ORACLE_ROLE')),
  REGISTRAR_ROLE: keccak256(toHex('REGISTRAR_ROLE')),
};

// Expected roles each wallet MUST hold (two-domain separation).
const EXPECTED = {
  REGULATOR: { must: ['REGULATOR_ROLE'], mustNot: ['OPERATOR_ROLE'] },
  OPERATOR:  { must: ['OPERATOR_ROLE'],  mustNot: ['REGULATOR_ROLE'] },
};

async function main() {
  console.log('=================================================================');
  console.log('\u26a0 VOLTMESH -- ON-CHAIN ROLE VERIFICATION');
  console.log('=================================================================');
  console.log(`RPC:            ${RPC_URL}`);
  console.log(`AccessRegistry: ${accessAddr}`);
  console.log(`ParticipantReg: ${ participantAddr ?? '(not set)' }`);
  console.log('');

  for (const [label, rawAddr] of Object.entries(ACCOUNTS)) {
    if (!rawAddr) { fail(`${label}_ADDRESS not set`); continue; }
    let addr;
    try { addr = getAddress(rawAddr); } catch { fail(`${label}_ADDRESS invalid: ${rawAddr}`); continue; }

    const held = [];
    for (const [roleName, roleHash] of Object.entries(ROLES)) {
      try {
        const ok = await client.readContract({ address: accessAddr, abi: ROLE_ABI, functionName: 'hasRole', args: [roleHash, addr] });
        if (ok) held.push(roleName);
      } catch (e) {
        fail(`hasRole(${roleName}, ${label}) read failed: ${e.shortMessage || e.message}`);
      }
    }

    let participantInfo = 'not registered';
    if (participantAddr) {
      try {
        const p = await client.readContract({ address: participantAddr, abi: PARTICIPANT_ABI, functionName: 'participants', args: [addr] });
        if (p && p[5] > 0n) {
          const roleType = Number(p[2]);
          const typeName = roleType === 0 ? 'CONSUMER (buyer)' : roleType === 1 ? 'PROSUMER (seller)' : roleType === 2 ? 'DISCOM_OPERATOR' : 'unknown';
          participantInfo = `${typeName}${p[4] ? ' [SUSPENDED]' : ''}`;
        }
      } catch { /* participant registry optional */ }
    }

    console.log(`\u25b8 ${label}  ${addr}`);
    console.log(`    Access roles: ${held.length ? held.join(', ') : '(none)'}`);
    console.log(`    Participant:  ${participantInfo}`);

    const exp = EXPECTED[label];
    if (exp) {
      for (const need of exp.must) {
        if (!held.includes(need)) fail(`${label} (${addr}) missing required role ${need}`);
      }
      for (const bad of exp.mustNot) {
        if (held.includes(bad)) fail(`${label} (${addr}) must NOT hold ${bad} (two-domain separation violated)`);
      }
    }
    console.log('');
  }

  if (process.exitCode) {
    console.log('\u2717 ROLE VERIFICATION FAILED -- see errors above.');
    process.exit(process.exitCode);
  } else {
    console.log('\u2705 ROLE VERIFICATION PASSED.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
