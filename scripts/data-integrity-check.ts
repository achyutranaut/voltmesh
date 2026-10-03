import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPublicClient, http } from 'viem';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

interface CheckResult {
  category: string;
  check: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  details: string;
}

const results: CheckResult[] = [];

function record(category: string, check: string, status: 'PASS' | 'WARN' | 'FAIL', details: string) {
  results.push({ category, check, status, details });
  const icon = status === 'PASS' ? '✅ [PASS]' : status === 'WARN' ? '⚠️  [WARN]' : '❌ [FAIL]';
  console.log(`${icon} [${category}] ${check}: ${details}`);
}

async function runIntegrityChecks() {
  console.log('===============================================================');
  console.log('⚡ VOLTMESH — AUTOMATED DATA INTEGRITY & SOURCE-OF-TRUTH AUDIT');
  console.log('===============================================================\n');

  // 1. Contract Address Consistency Check
  const webDeploymentsPath = path.join(rootDir, 'apps/web/src/contracts/deployments.json');
  const broadcastPath = path.join(rootDir, 'contracts/broadcast/Deploy.s.sol/31337/run-latest.json');

  if (!fs.existsSync(webDeploymentsPath)) {
    record('CONTRACTS', 'Deployments File', 'FAIL', 'apps/web/src/contracts/deployments.json does not exist');
  } else {
    record('CONTRACTS', 'Deployments File', 'PASS', 'Found apps/web/src/contracts/deployments.json');
    const webDeployments = JSON.parse(fs.readFileSync(webDeploymentsPath, 'utf8'));

    if (fs.existsSync(broadcastPath)) {
      const broadcast = JSON.parse(fs.readFileSync(broadcastPath, 'utf8'));
      const deployedInBroadcast: Record<string, string> = {};
      for (const tx of broadcast.transactions) {
        if (tx.contractName && tx.contractAddress) {
          deployedInBroadcast[tx.contractName] = tx.contractAddress.toLowerCase();
        }
      }

      let allMatched = true;
      for (const [name, contract] of Object.entries<any>(webDeployments.contracts)) {
        const expected = deployedInBroadcast[name];
        const actual = contract.address.toLowerCase();
        if (expected && expected !== actual) {
          allMatched = false;
          record('CONTRACTS', `Address Match: ${name}`, 'FAIL', `Expected ${expected} from broadcast, found ${actual} in web`);
        }
      }
      if (allMatched) {
        record('CONTRACTS', 'Broadcast Alignment', 'PASS', 'All deployed contract addresses match Forge broadcast deployment records exactly.');
      }
    } else {
      record('CONTRACTS', 'Broadcast Alignment', 'WARN', 'contracts/broadcast/Deploy.s.sol/31337/run-latest.json not found');
    }

    // 2. Chain ID Consistency Check
    const expectedChainId = 31337;
    if (webDeployments.chainId === expectedChainId) {
      record('CHAIN', 'Web Deployments Chain ID', 'PASS', `Chain ID is canonically set to ${expectedChainId}`);
    } else {
      record('CHAIN', 'Web Deployments Chain ID', 'FAIL', `Expected ${expectedChainId}, got ${webDeployments.chainId}`);
    }

    // 3. Scan for Disallowed Fabricated Merkle Roots & Fallback Hashes in Web Components
    const webSrcDir = path.join(rootDir, 'apps/web/src');
    const filesToScan: string[] = [];

    function collectFiles(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collectFiles(fullPath);
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
          filesToScan.push(fullPath);
        }
      }
    }
    collectFiles(webSrcDir);

    let foundFakeRoots = false;
    let foundBadFallbacks = false;

    for (const file of filesToScan) {
      const relPath = path.relative(rootDir, file);
      const content = fs.readFileSync(file, 'utf8');

      // Check for repeat-character fake roots
      if (content.includes("'1'.repeat(64)") || content.includes('"1".repeat(64)')) {
        foundFakeRoots = true;
        record('INTEGRITY', `Fake Root Pattern in ${relPath}`, 'FAIL', 'Found manufactured fallback root "0x1111..."');
      }

      // Check for old stale addresses as hardcoded fallbacks
      if (content.includes('0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9')) {
        foundBadFallbacks = true;
        record('INTEGRITY', `Stale Address Fallback in ${relPath}`, 'FAIL', 'Found stale EpochOracle fallback address 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9');
      }
    }

    if (!foundFakeRoots) {
      record('INTEGRITY', 'Fake Merkle Roots Check', 'PASS', 'No repeat-character manufactured Merkle roots detected.');
    }
    if (!foundBadFallbacks) {
      record('INTEGRITY', 'Contract Fallback Addresses Check', 'PASS', 'No stale fallback addresses detected in UI components.');
    }

    // 4. On-Chain RPC Live Connectivity & Bytecode Check (Optional live verification)
    try {
      const publicClient = createPublicClient({
        transport: http(webDeployments.rpcUrl || 'http://127.0.0.1:8545'),
      });
      const blockNum = await publicClient.getBlockNumber();
      record('RPC', 'Local Node Health', 'PASS', `Connected to ${webDeployments.rpcUrl}. Current Block: #${blockNum.toString()}`);

      // Verify bytecode exists for contracts
      for (const [name, contract] of Object.entries<any>(webDeployments.contracts)) {
        try {
          const code = await publicClient.getBytecode({ address: contract.address });
          if (code && code !== '0x') {
            record('BYTECODE', `${name} On-Chain State`, 'PASS', `Bytecode verified at ${contract.address} (${code.length / 2} bytes)`);
          } else {
            record('BYTECODE', `${name} On-Chain State`, 'WARN', `No bytecode at ${contract.address}. Has Anvil been restarted without re-deploying?`);
          }
        } catch (e: any) {
          record('BYTECODE', `${name} Query Error`, 'WARN', e.message);
        }
      }
    } catch (e: any) {
      record('RPC', 'Local Node Health', 'WARN', `Could not reach local Anvil node at ${webDeployments.rpcUrl}: ${e.message}. (Node is not currently running).`);
    }
  }

  console.log('\n===============================================================');
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const warnCount = results.filter((r) => r.status === 'WARN').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;

  console.log(`SUMMARY: ${passCount} PASSED · ${warnCount} WARNINGS · ${failCount} FAILURES`);
  if (failCount > 0) {
    console.log('STATUS: ❌ INTEGRITY AUDIT FAILED (Action required)');
    process.exitCode = 1;
  } else {
    console.log('STATUS: ✅ INTEGRITY AUDIT PASSED');
  }
  console.log('===============================================================\n');
}

runIntegrityChecks().catch((err) => {
  console.error('Fatal integrity check runner error:', err);
  process.exit(1);
});
