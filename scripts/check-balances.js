#!/usr/bin/env node
/**
 * check-balances.js — Print vUSD wallet + escrow balances for the demo wallets
 * and the escrow contract. Optionally drive a scripted deposit -> settle ->
 * withdraw to demonstrate real on-chain vUSD movement.
 *
 * READ-ONLY by default. To run the scripted trade you must supply the operator
 * and actor private keys via env (never committed). If keys are absent it just
 * prints the current balances.
 *
 * Usage (read-only snapshot):
 *   RPC_URL=... MOCK_ERC20_ADDRESS=0x.. ESCROW_ADDRESS=0x.. \
 *   REGULATOR_ADDRESS=0x.. SELLER_ADDRESS=0x.. BUYER_ADDRESS=0x.. \
 *   node scripts/check-balances.js
 *
 * Scripted trade (requires keys):
 *   ... BUYER_PRIVATE_KEY=0x.. SELLER_PRIVATE_KEY=0x.. OPERATOR_PRIVATE_KEY=0x.. \
 *   TRADE_AMOUNT=100 node scripts/check-balances.js
 */
import { createPublicClient, createWalletClient, http, getAddress, parseUnits, formatUnits, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'approve', inputs: [{ name: 's', type: 'address' }, { name: 'a', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
];
const ESCROW_ABI = [
  { type: 'function', name: 'balances', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'lockedBalances', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'deposit', inputs: [{ name: 'a', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'withdraw', inputs: [{ name: 'a', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
];
const SETTLEMENT_ABI = [
  { type: 'function', name: 'hashObligation', inputs: [
      { name: 'obligationId', type: 'bytes32' }, { name: 'buyer', type: 'address' }, { name: 'seller', type: 'address' },
      { name: 'amount', type: 'uint256' }, { name: 'zoneId', type: 'uint32' }, { name: 'intervalIdx', type: 'uint32' }, { name: 'deadline', type: 'uint64' },
    ], outputs: [{ type: 'bytes32' }], stateMutability: 'view' },
  { type: 'function', name: 'lockObligation', inputs: [
      { name: 'obligationId', type: 'bytes32' }, { name: 'buyer', type: 'address' }, { name: 'seller', type: 'address' },
      { name: 'amount', type: 'uint256' }, { name: 'zoneId', type: 'uint32' }, { name: 'intervalIdx', type: 'uint32' }, { name: 'deadline', type: 'uint64' },
      { name: 'buyerSig', type: 'bytes' }, { name: 'sellerSig', type: 'bytes' },
    ], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'updateObligationState', inputs: [{ name: 'obligationId', type: 'bytes32' }, { name: 'newState', type: 'uint8' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'settleObligation', inputs: [{ name: 'obligationId', type: 'bytes32' }, { name: 'settleAmount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
];

function loadDeployment() {
  const p = path.join(__dirname, '..', 'apps', 'web', 'src', 'contracts', 'deployments.json');
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  return {};
}

const dep = loadDeployment();
const RPC_URL = process.env.RPC_URL || dep.rpcUrl;
const tokenAddr = process.env.MOCK_ERC20_ADDRESS || dep.MockERC20;
const escrowAddr = process.env.ESCROW_ADDRESS || dep.Escrow;
const settlementAddr = process.env.BATCH_SETTLEMENT_ADDRESS || dep.BatchSettlement;

const WALLETS = {
  REGULATOR: process.env.REGULATOR_ADDRESS,
  SELLER: process.env.SELLER_ADDRESS,
  BUYER: process.env.BUYER_ADDRESS,
};

if (!RPC_URL || !tokenAddr || !escrowAddr) {
  console.error('Missing RPC_URL / MOCK_ERC20_ADDRESS / ESCROW_ADDRESS (or deployments.json).');
  process.exit(1);
}

const pub = createPublicClient({ transport: http(RPC_URL) });
const fmt = (v) => Number(formatUnits(v ?? 0n, 18)).toLocaleString('en-US', { maximumFractionDigits: 4 });


async function snapshot(tag) {
  console.log(`\n----- ${tag} -----`);
  const escrowVault = await pub.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [escrowAddr] });
  console.log(`ESCROW VAULT vUSD:            ${fmt(escrowVault)}`);
  for (const [label, raw] of Object.entries(WALLETS)) {
    if (!raw) { console.log(`${label}: (not set)`); continue; }
    const addr = getAddress(raw);
    const wallet = await pub.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [addr] });
    const inEscrow = await pub.readContract({ address: escrowAddr, abi: ESCROW_ABI, functionName: 'balances', args: [addr] });
    const locked = await pub.readContract({ address: escrowAddr, abi: ESCROW_ABI, functionName: 'lockedBalances', args: [addr] });
    console.log(`${label.padEnd(10)} ${addr}`);
    console.log(`   wallet vUSD: ${fmt(wallet)}   escrow: ${fmt(inEscrow)}   locked: ${fmt(locked)}`);
  }
}

async function scriptedTrade() {
  const buyerKey = process.env.BUYER_PRIVATE_KEY;
  const sellerKey = process.env.SELLER_PRIVATE_KEY;
  const operatorKey = process.env.OPERATOR_PRIVATE_KEY;
  const amount = parseUnits(process.env.TRADE_AMOUNT || '100', 18);

  const buyerAcc = privateKeyToAccount(buyerKey);
  const sellerAcc = privateKeyToAccount(sellerKey);
  const operatorAcc = privateKeyToAccount(operatorKey);
  const buyerW = createWalletClient({ account: buyerAcc, transport: http(RPC_URL) });
  const sellerW = createWalletClient({ account: sellerAcc, transport: http(RPC_URL) });
  const operatorW = createWalletClient({ account: operatorAcc, transport: http(RPC_URL) });

  const obligationId = keccak256(toHex(`demo-trade-${Date.now()}`));
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  console.log('\n▶ Buyer approves + deposits into escrow...');
  await buyerW.writeContract({ address: tokenAddr, abi: ERC20_ABI, functionName: 'approve', args: [escrowAddr, amount] }).then((h) => pub.waitForTransactionReceipt({ hash: h }));
  await buyerW.writeContract({ address: escrowAddr, abi: ESCROW_ABI, functionName: 'deposit', args: [amount] }).then((h) => pub.waitForTransactionReceipt({ hash: h }));

  console.log('▶ Operator locks obligation (buyer + seller EIP-712 sigs)...');
  const hash = await pub.readContract({ address: settlementAddr, abi: SETTLEMENT_ABI, functionName: 'hashObligation', args: [obligationId, buyerAcc.address, sellerAcc.address, amount, 1, 48, deadline] });
  const buyerSig = await buyerW.signMessage({ account: buyerAcc, message: { raw: hash } });
  const sellerSig = await sellerW.signMessage({ account: sellerAcc, message: { raw: hash } });
  await operatorW.writeContract({ address: settlementAddr, abi: SETTLEMENT_ABI, functionName: 'lockObligation', args: [obligationId, buyerAcc.address, sellerAcc.address, amount, 1, 48, deadline, buyerSig, sellerSig] }).then((h) => pub.waitForTransactionReceipt({ hash: h }));

  console.log('▶ Operator settles (seller paid in full)...');
  await operatorW.writeContract({ address: settlementAddr, abi: SETTLEMENT_ABI, functionName: 'updateObligationState', args: [obligationId, 3] }).then((h) => pub.waitForTransactionReceipt({ hash: h })); // DELIVERY_VERIFIED
  await operatorW.writeContract({ address: settlementAddr, abi: SETTLEMENT_ABI, functionName: 'updateObligationState', args: [obligationId, 5] }).then((h) => pub.waitForTransactionReceipt({ hash: h })); // SETTLEMENT_READY
  await operatorW.writeContract({ address: settlementAddr, abi: SETTLEMENT_ABI, functionName: 'settleObligation', args: [obligationId, amount] }).then((h) => pub.waitForTransactionReceipt({ hash: h }));

  console.log('▶ Seller withdraws settled vUSD to their wallet...');
  await sellerW.writeContract({ address: escrowAddr, abi: ESCROW_ABI, functionName: 'withdraw', args: [amount] }).then((h) => pub.waitForTransactionReceipt({ hash: h }));
}

async function main() {
  console.log('=================================================================');
  console.log('⚡ VOLTMESH — vUSD BALANCE CHECK');
  console.log('=================================================================');
  console.log(`RPC:     ${RPC_URL}`);
  console.log(`vUSD:    ${tokenAddr}`);
  console.log(`Escrow:  ${escrowAddr}`);

  await snapshot('BEFORE');

  const canTrade = process.env.BUYER_PRIVATE_KEY && process.env.SELLER_PRIVATE_KEY && process.env.OPERATOR_PRIVATE_KEY;
  if (canTrade) {
    await scriptedTrade();
    await snapshot('AFTER (scripted trade)');
  } else {
    console.log('\n(No *_PRIVATE_KEY env provided — read-only snapshot. Set BUYER/SELLER/OPERATOR_PRIVATE_KEY to run the scripted trade.)');
  }
}

main().catch((e) => { console.error(e?.shortMessage || e); process.exit(1); });
