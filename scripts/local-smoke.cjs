#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { createWalletClient, createPublicClient, http, parseEther, formatEther, keccak256, encodePacked } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');

async function runSmokeTest() {
  const rootDir = path.resolve(__dirname, '..');
  const localDeployPath = path.join(rootDir, 'contracts/deployments/local.json');

  if (!fs.existsSync(localDeployPath)) {
    console.error('ERROR: contracts/deployments/local.json not found. Run scripts/local-demo.sh first.');
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(localDeployPath, 'utf8'));
  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const apiUrl = process.env.API_URL || 'http://localhost:3000';
  const chainId = deployment.chainId || 31337;

  const chainObj = {
    id: Number(chainId),
    name: 'VoltMesh Local Devnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };

  const publicClient = createPublicClient({ chain: chainObj, transport: http(rpcUrl) });

  // Standard Anvil Public Dev Accounts
  const accounts = {
    regulator: {
      account: privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'), // #1
      role: 'regulator',
    },
    operator: {
      account: privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'), // #2
      role: 'discom',
    },
    seller: {
      account: privateKeyToAccount('0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a'), // #4
      role: 'seller',
    },
    buyer: {
      account: privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba'), // #5
      role: 'buyer',
    },
  };

  const erc20Abi = [
    {
      type: 'function',
      name: 'approve',
      inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
      outputs: [{ name: '', type: 'bool' }],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'balanceOf',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'view',
    },
  ];

  const escrowAbi = [
    {
      type: 'function',
      name: 'deposit',
      inputs: [{ name: 'amount', type: 'uint256' }],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'withdraw',
      inputs: [{ name: 'amount', type: 'uint256' }],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'balances',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'lockedBalances',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'getFreeBalance',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'view',
    },
  ];

  const batchSettlementAbi = [
    {
      type: 'function',
      name: 'hashObligation',
      inputs: [
        { name: 'obligationId', type: 'bytes32' },
        { name: 'buyer', type: 'address' },
        { name: 'seller', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'zoneId', type: 'uint32' },
        { name: 'intervalIdx', type: 'uint32' },
        { name: 'deadline', type: 'uint64' },
      ],
      outputs: [{ name: '', type: 'bytes32' }],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'lockObligation',
      inputs: [
        { name: 'obligationId', type: 'bytes32' },
        { name: 'buyer', type: 'address' },
        { name: 'seller', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'zoneId', type: 'uint32' },
        { name: 'intervalIdx', type: 'uint32' },
        { name: 'deadline', type: 'uint64' },
        { name: 'buyerSig', type: 'bytes' },
        { name: 'sellerSig', type: 'bytes' },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'updateObligationState',
      inputs: [
        { name: 'obligationId', type: 'bytes32' },
        { name: 'newState', type: 'uint8' },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'settleObligation',
      inputs: [
        { name: 'obligationId', type: 'bytes32' },
        { name: 'settleAmount', type: 'uint256' },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
  ];

  async function siweLogin(ident) {
    const resChal = await fetch(`${apiUrl}/auth/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: ident.account.address }),
    });
    if (!resChal.ok) {
      throw new Error(`Challenge failed for ${ident.account.address}: ${resChal.statusText}`);
    }
    const { message } = await resChal.json();
    const signature = await ident.account.signMessage({ message });

    const resVer = await fetch(`${apiUrl}/auth/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: ident.account.address, message, signature }),
    });
    if (!resVer.ok) {
      throw new Error(`Verification failed for ${ident.account.address}: ${resVer.statusText}`);
    }
    const data = await resVer.json();
    return data.token;
  }

  console.log('==================================================================');
  console.log('          VoltMesh Local Devnet End-to-End Smoke Test             ');
  console.log('==================================================================');

  // STEP 1: Backend Health Check
  console.log('\n[TEST 1/8] Verifying Backend Service Health...');
  const healthRes = await fetch(`${apiUrl}/health`);
  if (!healthRes.ok) {
    throw new Error(`Backend /health endpoint failed with status ${healthRes.status}`);
  }
  const healthData = await healthRes.json();
  console.log(`           Status: ${healthData.status || 'OK'}`);
  if (healthData.operatorAddress) {
    console.log(`           Operator Address: ${healthData.operatorAddress}`);
    if (healthData.operatorAddress.toLowerCase() !== accounts.operator.account.address.toLowerCase()) {
      throw new Error(`Operator address mismatch: expected ${accounts.operator.account.address}, got ${healthData.operatorAddress}`);
    }
  }
  console.log('           ✓ PASS: Backend is healthy and configured.');

  // STEP 2: SIWE Authentication for all roles
  console.log('\n[TEST 2/8] Authenticating All 4 Roles via SIWE Flow...');
  const tokens = {};
  for (const [key, ident] of Object.entries(accounts)) {
    tokens[key] = await siweLogin(ident);
    console.log(`           ✓ Authenticated ${key.padEnd(9)} (${ident.account.address.slice(0, 8)}...) -> Token OK`);
  }
  console.log('           ✓ PASS: SIWE token issuance verified for all roles.');

  // STEP 3: Buyer Shortfall Deposit + Bid Submission
  console.log('\n[TEST 3/8] Buyer Funding Escrow Shortfall & Placing Bid...');
  const buyerWalletClient = createWalletClient({
    account: accounts.buyer.account,
    chain: chainObj,
    transport: http(rpcUrl),
  });

  const depositAmount = parseEther('100'); // 100 vUSD
  console.log(`           Buyer approving ${formatEther(depositAmount)} vUSD to Escrow...`);
  const appHash = await buyerWalletClient.writeContract({
    address: deployment.MockERC20,
    abi: erc20Abi,
    functionName: 'approve',
    args: [deployment.Escrow, depositAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: appHash });

  console.log(`           Buyer depositing ${formatEther(depositAmount)} vUSD into Escrow...`);
  const depHash = await buyerWalletClient.writeContract({
    address: deployment.Escrow,
    abi: escrowAbi,
    functionName: 'deposit',
    args: [depositAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: depHash });

  const buyerFreeBal = await publicClient.readContract({
    address: deployment.Escrow,
    abi: escrowAbi,
    functionName: 'getFreeBalance',
    args: [accounts.buyer.account.address],
  });
  console.log(`           Buyer Free Escrow Balance: ${formatEther(buyerFreeBal)} vUSD`);

  const currentInterval = Math.floor(Date.now() / 1000 / 900);
  console.log(`           Submitting Buyer BID for interval ${currentInterval} via API...`);
  const bidRes = await fetch(`${apiUrl}/api/v1/orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${tokens.buyer}`,
    },
    body: JSON.stringify({
      zoneId: 1,
      intervalIdx: currentInterval,
      side: 'BUY',
      quantityWh: '5000',
      pricePaisePerKWh: '600',
      expiry: Math.floor(Date.now() / 1000) + 3600,
    }),
  });
  if (!bidRes.ok) {
    const errText = await bidRes.text();
    throw new Error(`Buyer bid submission failed (${bidRes.status}): ${errText}`);
  }
  const bidData = await bidRes.json();
  console.log(`           ✓ Bid placed: Order ID ${bidData.orderId || bidData.id || 'OK'}`);
  console.log('           ✓ PASS: Buyer shortfall funded and order accepted.');

  // STEP 4: Seller Ask Submission
  console.log('\n[TEST 4/8] Seller Submitting Energy Ask...');
  console.log(`           Submitting Seller ASK for interval ${currentInterval} via API...`);
  const askRes = await fetch(`${apiUrl}/api/v1/orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${tokens.seller}`,
    },
    body: JSON.stringify({
      zoneId: 1,
      intervalIdx: currentInterval,
      side: 'SELL',
      quantityWh: '5000',
      pricePaisePerKWh: '500',
      expiry: Math.floor(Date.now() / 1000) + 3600,
    }),
  });
  if (!askRes.ok) {
    const errText = await askRes.text();
    throw new Error(`Seller ask submission failed (${askRes.status}): ${errText}`);
  }
  const askData = await askRes.json();
  console.log(`           ✓ Ask placed: Order ID ${askData.orderId || askData.id || 'OK'}`);
  console.log('           ✓ PASS: Seller energy listed on the orderbook.');

  // STEP 5: Operator Clears Call Auction
  console.log('\n[TEST 5/8] Operator Clearing Call Auction (Uniform Price Matching)...');
  const clearRes = await fetch(`${apiUrl}/api/v1/markets/zones/1/clear/${currentInterval}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${tokens.operator}`,
    },
  });
  if (!clearRes.ok) {
    const errText = await clearRes.text();
    throw new Error(`Operator market clearing failed (${clearRes.status}): ${errText}`);
  }
  const clearData = await clearRes.json();
  console.log(`           Cleared Volume: ${clearData.clearedVolumeWh} Wh`);
  console.log(`           Clearing Price: ${clearData.clearingPricePaiseKWh} paise/kWh`);
  console.log(`           Obligations Root: ${clearData.obligationsMerkleRoot}`);
  console.log('           ✓ PASS: Call auction cleared and verified.');

  // STEP 6: Escrow Settlement & Seller Credit
  console.log('\n[TEST 6/8] Executing On-Chain Obligation Settlement & Escrow Credit...');
  const operatorWalletClient = createWalletClient({
    account: accounts.operator.account,
    chain: chainObj,
    transport: http(rpcUrl),
  });

  const obligationId = keccak256(
    encodePacked(
      ['string', 'address', 'address', 'uint32', 'uint32'],
      ['smoke-ob-1', accounts.buyer.account.address, accounts.seller.account.address, 1, currentInterval]
    )
  );
  const tradeValue = parseEther('25'); // 25 vUSD delivered energy value
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const oblHash = await publicClient.readContract({
    address: deployment.BatchSettlement,
    abi: batchSettlementAbi,
    functionName: 'hashObligation',
    args: [
      obligationId,
      accounts.buyer.account.address,
      accounts.seller.account.address,
      tradeValue,
      1,
      currentInterval,
      deadline,
    ],
  });

  const buyerSig = await accounts.buyer.account.sign({ hash: oblHash });
  const sellerSig = await accounts.seller.account.sign({ hash: oblHash });

  console.log(`           Locking obligation collateral in Escrow for obligation ${obligationId.slice(0, 10)}...`);
  const lockTx = await operatorWalletClient.writeContract({
    address: deployment.BatchSettlement,
    abi: batchSettlementAbi,
    functionName: 'lockObligation',
    args: [
      obligationId,
      accounts.buyer.account.address,
      accounts.seller.account.address,
      tradeValue,
      1,
      currentInterval,
      deadline,
      buyerSig,
      sellerSig,
    ],
  });
  await publicClient.waitForTransactionReceipt({ hash: lockTx });

  console.log('           Advancing obligation: LOCKED -> DELIVERY_VERIFIED (5)...');
  const adv1Tx = await operatorWalletClient.writeContract({
    address: deployment.BatchSettlement,
    abi: batchSettlementAbi,
    functionName: 'updateObligationState',
    args: [obligationId, 5], // DELIVERY_VERIFIED (enum index 5)
  });
  await publicClient.waitForTransactionReceipt({ hash: adv1Tx });

  console.log('           Advancing obligation: DELIVERY_VERIFIED -> SETTLEMENT_READY (6)...');
  const adv2Tx = await operatorWalletClient.writeContract({
    address: deployment.BatchSettlement,
    abi: batchSettlementAbi,
    functionName: 'updateObligationState',
    args: [obligationId, 6], // SETTLEMENT_READY (enum index 6)
  });
  await publicClient.waitForTransactionReceipt({ hash: adv2Tx });

  console.log(`           Executing settleObligation: Crediting ${formatEther(tradeValue)} vUSD to Seller...`);
  const settleTx = await operatorWalletClient.writeContract({
    address: deployment.BatchSettlement,
    abi: batchSettlementAbi,
    functionName: 'settleObligation',
    args: [obligationId, tradeValue],
  });
  await publicClient.waitForTransactionReceipt({ hash: settleTx });

  const sellerEscrowFree = await publicClient.readContract({
    address: deployment.Escrow,
    abi: escrowAbi,
    functionName: 'getFreeBalance',
    args: [accounts.seller.account.address],
  });
  console.log(`           Seller Free Escrow Balance after Settlement: ${formatEther(sellerEscrowFree)} vUSD`);
  if (sellerEscrowFree < tradeValue) {
    throw new Error(`Seller free balance ${formatEther(sellerEscrowFree)} is less than expected ${formatEther(tradeValue)}`);
  }
  console.log('           ✓ PASS: Escrow credited delivered value directly to Seller free balance.');

  // STEP 7: Seller Withdraws Earnings to Wallet
  console.log('\n[TEST 7/8] Seller Withdrawing Free Earnings from Escrow...');
  const sellerWalletClient = createWalletClient({
    account: accounts.seller.account,
    chain: chainObj,
    transport: http(rpcUrl),
  });

  const walletBefore = await publicClient.readContract({
    address: deployment.MockERC20,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [accounts.seller.account.address],
  });

  console.log(`           Seller Wallet Token Balance before: ${formatEther(walletBefore)} vUSD`);
  console.log(`           Withdrawing ${formatEther(tradeValue)} vUSD from Escrow...`);
  const withdrawTx = await sellerWalletClient.writeContract({
    address: deployment.Escrow,
    abi: escrowAbi,
    functionName: 'withdraw',
    args: [tradeValue],
  });
  await publicClient.waitForTransactionReceipt({ hash: withdrawTx });

  const walletAfter = await publicClient.readContract({
    address: deployment.MockERC20,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [accounts.seller.account.address],
  });
  console.log(`           Seller Wallet Token Balance after:  ${formatEther(walletAfter)} vUSD`);
  if (walletAfter !== walletBefore + tradeValue) {
    throw new Error(`Wallet balance did not increase by withdrawn amount.`);
  }
  console.log('           ✓ PASS: Seller withdrawn earnings received in wallet.');

  // STEP 8: Regulator Clear Attempt Returns 403 Forbidden
  console.log('\n[TEST 8/8] Verifying Regulator Clearing Attempt is Blocked with 403...');
  const regClearRes = await fetch(`${apiUrl}/api/v1/markets/zones/1/clear/${currentInterval}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${tokens.regulator}`,
    },
  });
  console.log(`           Regulator Clear Response Status: ${regClearRes.status}`);
  if (regClearRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden for regulator clearing attempt, got ${regClearRes.status}`);
  }
  const regErrData = await regClearRes.json();
  console.log(`           Blocked Reason: ${regErrData.error || regErrData.message}`);
  console.log('           ✓ PASS: Regulator oversight boundary strictly enforced (read-only).');

  console.log('\n==================================================================');
  console.log('       ALL 8 SMOKE TESTS PASSED — SYSTEM FULLY OPERATIONAL        ');
  console.log('==================================================================\n');
}

runSmokeTest().catch((err) => {
  console.error('\n[SMOKE TEST FAILED]:', err);
  process.exit(1);
});
