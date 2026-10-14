#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { createWalletClient, createPublicClient, http, encodePacked, keccak256 } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');

async function main() {
  const deploymentPath = path.resolve(__dirname, '../contracts/deployments/local.json');
  if (!fs.existsSync(deploymentPath)) {
    console.error('Error: contracts/deployments/local.json not found. Run scripts/local-demo.sh first.');
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const oracleAddress = deployment.EpochOracle;
  const chainId = deployment.chainId || 31337;
  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';

  // Anvil Account #3 is designated Oracle
  const oraclePrivateKey = process.env.ORACLE_PRIVATE_KEY || '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6';
  const oracleAccount = privateKeyToAccount(oraclePrivateKey);

  const chainObj = {
    id: Number(chainId),
    name: 'VoltMesh Local Devnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };

  const publicClient = createPublicClient({ chain: chainObj, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account: oracleAccount, chain: chainObj, transport: http(rpcUrl) });

  // 15-minute interval math: floor(unix_timestamp / 900)
  // Unix timestamp is always UTC epoch seconds, so interval is consistent globally.
  const nowSeconds = Math.floor(Date.now() / 1000);
  const intervalIdx = Math.floor(nowSeconds / 900);
  const zoneId = 1;
  const leafCount = 1;
  const totalWh = 1000n;

  console.log('----------------------------------------------------');
  console.log('VoltMesh Epoch Reseeding');
  console.log('----------------------------------------------------');
  console.log(`RPC URL:          ${rpcUrl}`);
  console.log(`EpochOracle:      ${oracleAddress}`);
  console.log(`Oracle Signer:    ${oracleAccount.address}`);
  console.log(`Zone ID:          ${zoneId}`);
  console.log(`Current Interval: ${intervalIdx} (UTC epoch ${nowSeconds})`);
  console.log('----------------------------------------------------');

  const epochOracleAbi = [
    {
      type: 'function',
      name: 'submitEpoch',
      inputs: [
        { name: 'zoneId', type: 'uint32' },
        { name: 'intervalIdx', type: 'uint32' },
        { name: 'merkleRoot', type: 'bytes32' },
        { name: 'leafCount', type: 'uint32' },
        { name: 'totalWh', type: 'uint64' },
        { name: 'signatures', type: 'bytes[]' },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'getEpoch',
      inputs: [
        { name: 'zoneId', type: 'uint32' },
        { name: 'intervalIdx', type: 'uint32' },
      ],
      outputs: [
        {
          type: 'tuple',
          components: [
            { name: 'merkleRoot', type: 'bytes32' },
            { name: 'leafCount', type: 'uint32' },
            { name: 'totalWh', type: 'uint64' },
            { name: 'finalizedAt', type: 'uint64' },
            { name: 'status', type: 'uint8' },
            { name: 'challenger', type: 'address' },
          ],
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'error',
      name: 'EpochAlreadyFinalized',
      inputs: [
        { name: 'zoneId', type: 'uint32' },
        { name: 'intervalIdx', type: 'uint32' },
      ],
    },
  ];

  // Check if epoch is already seeded
  try {
    const existing = await publicClient.readContract({
      address: oracleAddress,
      abi: epochOracleAbi,
      functionName: 'getEpoch',
      args: [zoneId, intervalIdx],
    });
    if (existing && existing.status !== 0 && existing.status !== 4) {
      console.log(`Epoch for zone ${zoneId}, interval ${intervalIdx} is already finalized on-chain.`);
      console.log(`Status: ${existing.status}, Root: ${existing.merkleRoot}`);
      console.log(`[SUCCESS] Current interval ${intervalIdx} is active on-chain.`);
      return;
    }
  } catch (err) {
    // Proceed to submit
  }

  const merkleRoot = keccak256(
    encodePacked(
      ['string', 'uint256', 'uint32'],
      ['voltmesh-seed-epoch', BigInt(chainId), intervalIdx]
    )
  );

  // Raw message hash matching EpochOracle.sol:
  const rawHash = keccak256(
    encodePacked(
      ['uint256', 'address', 'uint32', 'uint32', 'bytes32', 'uint32', 'uint64'],
      [BigInt(chainId), oracleAddress, zoneId, intervalIdx, merkleRoot, leafCount, totalWh]
    )
  );

  const signature = await oracleAccount.signMessage({
    message: { raw: rawHash },
  });

  console.log('Submitting epoch to EpochOracle...');
  try {
    const txHash = await walletClient.writeContract({
      address: oracleAddress,
      abi: epochOracleAbi,
      functionName: 'submitEpoch',
      args: [zoneId, intervalIdx, merkleRoot, leafCount, totalWh, [signature]],
    });

    console.log(`Transaction broadcast: ${txHash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`Epoch confirmed in block: ${receipt.blockNumber} (status: ${receipt.status})`);
    console.log(`[SUCCESS] Current interval ${intervalIdx} is active on-chain.`);
  } catch (err) {
    if (err.message && (err.message.includes('EpochAlreadyFinalized') || err.message.includes('0xe43937da'))) {
      console.log(`Epoch for zone ${zoneId}, interval ${intervalIdx} is already finalized on-chain.`);
      console.log(`[SUCCESS] Current interval ${intervalIdx} is active on-chain.`);
      return;
    }
    throw err;
  }
}

main().catch((err) => {
  console.error('Failed to seed epoch:', err);
  process.exit(1);
});
