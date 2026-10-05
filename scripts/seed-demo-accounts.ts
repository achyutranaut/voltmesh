import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

interface Deployments {
  chainId: number;
  networkName: string;
  rpcUrl: string;
  contracts: Record<string, { address: Address; abi: any[] }>;
}

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';

// Anvil dev accounts
const DEPLOYER_KEY: Hex = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Account #0

interface DemoConfig {
  name: string;
  key: Hex;
  roleType?: number; // 0 = CONSUMER, 1 = PROSUMER, 2 = DISCOM
  accessRoles?: ('OPERATOR_ROLE' | 'AUDITOR_ROLE' | 'ORACLE_ROLE')[];
  mintAmount?: bigint;
  depositAmount?: bigint;
}

const DEMO_ACCOUNTS: DemoConfig[] = [
  {
    name: 'Buyer (Account #1)',
    key: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    roleType: 0, // CONSUMER
    mintAmount: parseEther('50000'),
    depositAmount: parseEther('10000'),
  },
  {
    name: 'Seller / Prosumer (Account #2)',
    key: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    roleType: 1, // PROSUMER
    mintAmount: parseEther('50000'),
    depositAmount: parseEther('5000'),
  },
  {
    name: 'DISCOM / Market Operator (Account #3)',
    key: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
    roleType: 2, // DISCOM
    accessRoles: ['OPERATOR_ROLE', 'ORACLE_ROLE'],
  },
  {
    name: 'Regulator / Auditor (Account #4)',
    key: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
    accessRoles: ['AUDITOR_ROLE'],
  },
];

async function seedDemoAccounts() {
  console.log('===============================================================');
  console.log('⚡ VOLTMESH — LOCAL DEVNET DEMO ACCOUNT SEEDING');
  console.log('===============================================================\n');

  // 1. Load deployment metadata
  const deploymentsPath = path.join(rootDir, 'apps/web/src/contracts/deployments.json');
  if (!fs.existsSync(deploymentsPath)) {
    console.error('❌ deployments.json not found at:', deploymentsPath);
    process.exit(1);
  }

  const deployments: Deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
  const { AccessRegistry, ParticipantRegistry, MockERC20, Escrow } = deployments.contracts;

  if (!AccessRegistry || !ParticipantRegistry || !MockERC20 || !Escrow) {
    console.error('❌ Required contract deployment addresses missing from deployments.json');
    process.exit(1);
  }

  // 2. Initialize viem clients
  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(RPC_URL),
  });

  const deployerAccount = privateKeyToAccount(DEPLOYER_KEY);
  const deployerWallet = createWalletClient({
    account: deployerAccount,
    chain: foundry,
    transport: http(RPC_URL),
  });

  // Check RPC connectivity
  try {
    const blockNumber = await publicClient.getBlockNumber();
    console.log(`Connected to local Devnet RPC at ${RPC_URL} (Block: #${blockNumber})`);
  } catch (err: any) {
    console.warn(`⚠️  Could not connect to Devnet RPC at ${RPC_URL}.`);
    console.warn('   To run against Anvil, start the node first:');
    console.warn('   $ anvil --chain-id 31337');
    console.warn('   $ cd contracts && forge script script/Deploy.s.sol --broadcast --rpc-url http://127.0.0.1:8545');
    console.log('\nExiting demo account seed gracefully.');
    return;
  }

  console.log('\n--- Seeding Participant & Access Roles ---');

  for (const demo of DEMO_ACCOUNTS) {
    const account = privateKeyToAccount(demo.key);
    console.log(`\nConfiguring ${demo.name} [${account.address}]:`);

    // A. Participant Registration
    if (demo.roleType !== undefined) {
      try {
        const isRegistered = (await publicClient.readContract({
          address: ParticipantRegistry.address,
          abi: ParticipantRegistry.abi,
          functionName: 'isRegisteredAndActive',
          args: [account.address],
        })) as boolean;

        if (isRegistered) {
          console.log(`  ✓ Already registered in ParticipantRegistry (roleType=${demo.roleType})`);
        } else {
          const participantId = keccak256(toHex(account.address));
          const bindingHash = keccak256(toHex(`binding:${account.address}`));
          const txHash = await deployerWallet.writeContract({
            address: ParticipantRegistry.address,
            abi: ParticipantRegistry.abi,
            functionName: 'registerParticipant',
            args: [account.address, participantId, 1, demo.roleType, bindingHash],
          });
          await publicClient.waitForTransactionReceipt({ hash: txHash });
          console.log(`  ✓ Registered in ParticipantRegistry (tx: ${txHash.slice(0, 10)}...)`);
        }
      } catch (err: any) {
        console.warn(`  ⚠️  Participant registration notice: ${err?.shortMessage || err.message}`);
      }
    }

    // B. Access Roles
    if (demo.accessRoles && demo.accessRoles.length > 0) {
      for (const roleName of demo.accessRoles) {
        try {
          const roleHash = keccak256(toHex(roleName));
          const hasRole = (await publicClient.readContract({
            address: AccessRegistry.address,
            abi: AccessRegistry.abi,
            functionName: 'hasRole',
            args: [roleHash, account.address],
          })) as boolean;

          if (hasRole) {
            console.log(`  ✓ Already holds role ${roleName}`);
          } else {
            const txHash = await deployerWallet.writeContract({
              address: AccessRegistry.address,
              abi: AccessRegistry.abi,
              functionName: 'grantRole',
              args: [roleHash, account.address],
            });
            await publicClient.waitForTransactionReceipt({ hash: txHash });
            console.log(`  ✓ Granted role ${roleName} (tx: ${txHash.slice(0, 10)}...)`);
          }
        } catch (err: any) {
          console.warn(`  ⚠️  Access role grant notice (${roleName}): ${err?.shortMessage || err.message}`);
        }
      }
    }

    // C. Payment Token Minting & Escrow Collateral Deposit
    if (demo.mintAmount && demo.mintAmount > 0n) {
      try {
        const currentBal = (await publicClient.readContract({
          address: MockERC20.address,
          abi: MockERC20.abi,
          functionName: 'balanceOf',
          args: [account.address],
        })) as bigint;

        if (currentBal < demo.mintAmount) {
          const mintHash = await deployerWallet.writeContract({
            address: MockERC20.address,
            abi: MockERC20.abi,
            functionName: 'mint',
            args: [account.address, demo.mintAmount],
          });
          await publicClient.waitForTransactionReceipt({ hash: mintHash });
          console.log(`  ✓ Minted ${Number(demo.mintAmount / 10n ** 18n).toLocaleString()} vUSD`);
        } else {
          console.log(`  ✓ Already holds ${Number(currentBal / 10n ** 18n).toLocaleString()} vUSD`);
        }

        // Deposit into Escrow if requested
        if (demo.depositAmount && demo.depositAmount > 0n) {
          const escrowBal = (await publicClient.readContract({
            address: Escrow.address,
            abi: Escrow.abi,
            functionName: 'balances',
            args: [account.address],
          })) as bigint;

          if (escrowBal < demo.depositAmount) {
            const userWallet = createWalletClient({
              account,
              chain: foundry,
              transport: http(RPC_URL),
            });

            // Approve Escrow
            const approveHash = await userWallet.writeContract({
              address: MockERC20.address,
              abi: MockERC20.abi,
              functionName: 'approve',
              args: [Escrow.address, demo.depositAmount],
            });
            await publicClient.waitForTransactionReceipt({ hash: approveHash });

            // Deposit
            const depositHash = await userWallet.writeContract({
              address: Escrow.address,
              abi: Escrow.abi,
              functionName: 'deposit',
              args: [demo.depositAmount],
            });
            await publicClient.waitForTransactionReceipt({ hash: depositHash });
            console.log(`  ✓ Deposited ${Number(demo.depositAmount / 10n ** 18n).toLocaleString()} vUSD into Escrow`);
          } else {
            console.log(`  ✓ Escrow balance sufficient (${Number(escrowBal / 10n ** 18n).toLocaleString()} vUSD)`);
          }
        }
      } catch (err: any) {
        console.warn(`  ⚠️  Mint / Escrow notice: ${err?.shortMessage || err.message}`);
      }
    }
  }

  // D. Ensure Devnet Oracle Node key has ORACLE_ROLE
  const DEVNET_ORACLE_ADDRESS: Address = '0x25A71a07cecf1753ee65b00E0a3AAEf7e0F51c0F';
  try {
    const oracleRoleHash = keccak256(toHex('ORACLE_ROLE'));
    const hasOracle = (await publicClient.readContract({
      address: AccessRegistry.address,
      abi: AccessRegistry.abi,
      functionName: 'hasRole',
      args: [oracleRoleHash, DEVNET_ORACLE_ADDRESS],
    })) as boolean;

    if (hasOracle) {
      console.log(`  ✓ Devnet Oracle Node (${DEVNET_ORACLE_ADDRESS.slice(0, 10)}...) already holds ORACLE_ROLE`);
    } else {
      const txHash = await deployerWallet.writeContract({
        address: AccessRegistry.address,
        abi: AccessRegistry.abi,
        functionName: 'grantRole',
        args: [oracleRoleHash, DEVNET_ORACLE_ADDRESS],
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`  ✓ Granted ORACLE_ROLE to Devnet Oracle Node (${DEVNET_ORACLE_ADDRESS.slice(0, 10)}...)`);
    }
  } catch (err: any) {
    console.warn(`  ⚠️  Devnet Oracle Node role grant notice: ${err?.shortMessage || err.message}`);
  }

  console.log('\n===============================================================');
  console.log('✅ DEMO ACCOUNT SEED COMPLETE — All 4 accounts ready for demo');
  console.log('===============================================================\n');
}

seedDemoAccounts().catch((err) => {
  console.error('Fatal error seeding demo accounts:', err);
  process.exit(1);
});
