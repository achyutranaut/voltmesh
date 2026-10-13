import { Address, Abi, defineChain, type Chain } from 'viem';
import deploymentArtifacts from '../contracts/deployments.json';

/**
 * ============================================================================
 * VoltMesh — Central Frontend Configuration
 * ============================================================================
 * EVERYTHING here is driven by VITE_* environment variables. Nothing is
 * hardcoded to localhost / chain 31337 in the production code path.
 *
 * Required in production (Vercel):
 *   VITE_CHAIN_ID        target chain id (default 80002 = Polygon Amoy)
 *   VITE_RPC_URL         JSON-RPC endpoint for the target chain
 *   VITE_<NAME>_ADDRESS  one deployed address per contract (see ADDRESS_ENV)
 *
 * Local Hardhat/Anvil development is available ONLY behind VITE_USE_LOCAL=true,
 * which additionally permits falling back to the committed local deployments.json.
 * ============================================================================
 */

export interface ContractConfig {
  address: Address;
  abi: Abi;
}

export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  currency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  explorerUrl?: string;
  contracts: Record<string, ContractConfig>;
}

const env = (import.meta.env ?? {}) as Record<string, string | undefined>;

/** Explicit opt-in for the local devnet. Off by default so production never
 *  silently falls back to http://127.0.0.1:8545. */
export const USE_LOCAL: boolean = env.VITE_USE_LOCAL === 'true';

/** Target chain id. Defaults to Polygon Amoy (80002) in production. */
export const CHAIN_ID: number = Number(
  env.VITE_CHAIN_ID ?? (USE_LOCAL ? '31337' : '80002')
);

/** Backend base URL (supports both the new and legacy variable names). */
export const API_URL: string =
  env.VITE_BACKEND_URL ?? env.VITE_API_URL ?? '';

const DEFAULT_RPC_BY_CHAIN: Record<number, string> = {
  80002: 'https://rpc-amoy.polygon.technology',
  31337: 'http://127.0.0.1:8545',
  11155111: 'https://ethereum-sepolia-rpc.publicnode.com',
};

export const RPC_URL: string = env.VITE_RPC_URL ?? DEFAULT_RPC_BY_CHAIN[CHAIN_ID] ?? '';

/** Google OAuth Client ID for Operator and Regulator login */
export const GOOGLE_CLIENT_ID: string = env.VITE_GOOGLE_CLIENT_ID ?? '';

/** Chain metadata used to define the chain for wagmi/viem and for the
 *  wallet_addEthereumChain fallback. */
const CHAIN_META: Record<number, { name: string; currency: NetworkConfig['currency']; explorerUrl?: string }> = {
  80002: {
    name: 'Polygon Amoy',
    currency: { name: 'POL', symbol: 'POL', decimals: 18 },
    explorerUrl: 'https://amoy.polygonscan.com',
  },
  31337: {
    name: 'VoltMesh Testnet (Local Devnet)',
    currency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  11155111: {
    name: 'Sepolia',
    currency: { name: 'Sepolia Ether', symbol: 'SEP', decimals: 18 },
    explorerUrl: 'https://sepolia.etherscan.io',
  },
};

const meta = CHAIN_META[CHAIN_ID] ?? {
  name: `Chain ${CHAIN_ID}`,
  currency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};

/**
 * The single chain definition used across the app (wagmi/viem). Built from the
 * configured RPC so a deployed build never points at localhost.
 */
export const voltmeshChain: Chain = defineChain({
  id: CHAIN_ID,
  name: meta.name,
  nativeCurrency: meta.currency,
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
  blockExplorers: meta.explorerUrl
    ? { default: { name: 'Explorer', url: meta.explorerUrl } }
    : undefined,
  testnet: true,
});

/** Backwards-compatible alias — many modules import `voltmeshTestnet`. */
export const voltmeshTestnet = voltmeshChain;

/**
 * Environment variable that supplies each contract address, and the artifact
 * key used to load its ABI (ABIs are network-agnostic and safe to bundle).
 */
export const ADDRESS_ENV: Record<string, string> = {
  AccessRegistry: 'VITE_ACCESS_REGISTRY_ADDRESS',
  ParticipantRegistry: 'VITE_PARTICIPANT_REGISTRY_ADDRESS',
  DeviceRegistry: 'VITE_DEVICE_REGISTRY_ADDRESS',
  EpochOracle: 'VITE_EPOCH_ORACLE_ADDRESS',
  MockERC20: 'VITE_MOCK_ERC20_ADDRESS',
  Escrow: 'VITE_ESCROW_ADDRESS',
  BatchSettlement: 'VITE_BATCH_SETTLEMENT_ADDRESS',
  CertificateRegistry: 'VITE_CERTIFICATE_REGISTRY_ADDRESS',
  RetirementRegistry: 'VITE_RETIREMENT_REGISTRY_ADDRESS',
};

const HEX_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

function resolveAddress(name: string): Address | undefined {
  const fromEnv = env[ADDRESS_ENV[name]];
  if (fromEnv && HEX_ADDRESS.test(fromEnv)) return fromEnv as Address;
  // Local dev only: fall back to the committed local deployment artifacts.
  if (USE_LOCAL) {
    const artifact = (deploymentArtifacts.contracts as Record<string, { address?: string }>)[name];
    if (artifact?.address && HEX_ADDRESS.test(artifact.address)) return artifact.address as Address;
  }
  return undefined;
}

function resolveAbi(name: string): Abi {
  const artifact = (deploymentArtifacts.contracts as Record<string, { abi?: Abi }>)[name];
  return (artifact?.abi ?? []) as Abi;
}

function buildContracts(): Record<string, ContractConfig> {
  const out: Record<string, ContractConfig> = {};
  for (const name of Object.keys(ADDRESS_ENV)) {
    const address = resolveAddress(name);
    if (address) out[name] = { address, abi: resolveAbi(name) };
  }
  return out;
}

const contracts = buildContracts();

export const SUPPORTED_NETWORKS: Record<number, NetworkConfig> = {
  [CHAIN_ID]: {
    chainId: CHAIN_ID,
    name: meta.name,
    rpcUrl: RPC_URL,
    currency: meta.currency,
    explorerUrl: meta.explorerUrl,
    contracts,
  },
};

// Local devnet is additionally addressable when explicitly enabled.
if (USE_LOCAL && CHAIN_ID !== 31337) {
  SUPPORTED_NETWORKS[31337] = {
    chainId: 31337,
    name: 'VoltMesh Testnet (Local Devnet)',
    rpcUrl: 'http://127.0.0.1:8545',
    currency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    contracts: (() => {
      const out: Record<string, ContractConfig> = {};
      for (const name of Object.keys(ADDRESS_ENV)) {
        const artifact = (deploymentArtifacts.contracts as Record<string, { address?: string; abi?: Abi }>)[name];
        if (artifact?.address) out[name] = { address: artifact.address as Address, abi: (artifact.abi ?? []) as Abi };
      }
      return out;
    })(),
  };
}

export const DEFAULT_CHAIN_ID = CHAIN_ID;

export function getNetworkConfig(chainId: number): NetworkConfig | undefined {
  return SUPPORTED_NETWORKS[chainId];
}

export function getContract(contractName: string, chainId: number = DEFAULT_CHAIN_ID): ContractConfig | null {
  const net = SUPPORTED_NETWORKS[chainId];
  if (!net || !net.contracts[contractName]) {
    return null;
  }
  return net.contracts[contractName];
}

export function getExplorerTxUrl(txHash: string, chainId: number = DEFAULT_CHAIN_ID): string {
  const net = SUPPORTED_NETWORKS[chainId];
  if (net?.explorerUrl) {
    return `${net.explorerUrl}/tx/${txHash}`;
  }
  if (chainId === 31337) return `${net?.rpcUrl ?? 'http://127.0.0.1:8545'}#tx/${txHash}`;
  return '#';
}

export function getExplorerAddressUrl(address: string, chainId: number = DEFAULT_CHAIN_ID): string {
  const net = SUPPORTED_NETWORKS[chainId];
  if (net?.explorerUrl) {
    return `${net.explorerUrl}/address/${address}`;
  }
  if (chainId === 31337) return `${net?.rpcUrl ?? 'http://127.0.0.1:8545'}#address/${address}`;
  return '#';
}

/**
 * Startup validation. Returns a list of human-readable problems so the UI can
 * render a clear banner instead of silently reverting to localhost.
 */
export function getConfigErrors(): string[] {
  const errors: string[] = [];

  if (!RPC_URL) {
    errors.push('VITE_RPC_URL is not set.');
  }

  if (!USE_LOCAL) {
    for (const name of Object.keys(ADDRESS_ENV)) {
      if (!resolveAddress(name)) {
        errors.push(`${ADDRESS_ENV[name]} is missing or invalid (required for ${name}).`);
      }
    }
  } else {
    // Even in local mode we need the core contracts to render anything useful.
    for (const name of ['AccessRegistry', 'ParticipantRegistry', 'MockERC20', 'Escrow', 'BatchSettlement']) {
      if (!resolveAddress(name)) {
        errors.push(`Local ${name} address could not be resolved (check deployments.json).`);
      }
    }
  }

  if (!API_URL) {
    errors.push('VITE_BACKEND_URL (or VITE_API_URL) is not set; backend calls will fail.');
  }

  return errors;
}

