import { Address, Abi, defineChain } from 'viem';
import deploymentArtifacts from '../contracts/deployments.json';

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

// 1. VoltMesh Local Testnet (Chain ID 31337)
export const voltmeshTestnet = defineChain({
  id: 31337,
  name: 'VoltMesh Testnet (Local Devnet)',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['http://127.0.0.1:8545'],
    },
    public: {
      http: ['http://127.0.0.1:8545'],
    },
  },
  testnet: true,
});

// 2. Ethereum Sepolia (Chain ID 11155111)
export const sepoliaTestnet = defineChain({
  id: 11155111,
  name: 'Sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'Sepolia Ether',
    symbol: 'SEP',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.sepolia.org'],
    },
    public: {
      http: ['https://rpc.sepolia.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Etherscan',
      url: 'https://sepolia.etherscan.io',
    },
  },
  testnet: true,
});

export const SUPPORTED_NETWORKS: Record<number, NetworkConfig> = {
  31337: {
    chainId: 31337,
    name: 'VoltMesh Testnet (Local Devnet)',
    rpcUrl: 'http://127.0.0.1:8545',
    currency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    contracts: {
      AccessRegistry: {
        address: deploymentArtifacts.contracts.AccessRegistry.address as Address,
        abi: deploymentArtifacts.contracts.AccessRegistry.abi as Abi,
      },
      ParticipantRegistry: {
        address: deploymentArtifacts.contracts.ParticipantRegistry.address as Address,
        abi: deploymentArtifacts.contracts.ParticipantRegistry.abi as Abi,
      },
      DeviceRegistry: {
        address: deploymentArtifacts.contracts.DeviceRegistry.address as Address,
        abi: deploymentArtifacts.contracts.DeviceRegistry.abi as Abi,
      },
      EpochOracle: {
        address: deploymentArtifacts.contracts.EpochOracle.address as Address,
        abi: deploymentArtifacts.contracts.EpochOracle.abi as Abi,
      },
      MockERC20: {
        address: deploymentArtifacts.contracts.MockERC20.address as Address,
        abi: deploymentArtifacts.contracts.MockERC20.abi as Abi,
      },
      Escrow: {
        address: deploymentArtifacts.contracts.Escrow.address as Address,
        abi: deploymentArtifacts.contracts.Escrow.abi as Abi,
      },
      BatchSettlement: {
        address: deploymentArtifacts.contracts.BatchSettlement.address as Address,
        abi: deploymentArtifacts.contracts.BatchSettlement.abi as Abi,
      },
      CertificateRegistry: {
        address: deploymentArtifacts.contracts.CertificateRegistry.address as Address,
        abi: deploymentArtifacts.contracts.CertificateRegistry.abi as Abi,
      },
      RetirementRegistry: {
        address: deploymentArtifacts.contracts.RetirementRegistry.address as Address,
        abi: deploymentArtifacts.contracts.RetirementRegistry.abi as Abi,
      },
    },
  },
  11155111: {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    rpcUrl: 'https://rpc.sepolia.org',
    explorerUrl: 'https://sepolia.etherscan.io',
    currency: {
      name: 'Sepolia ETH',
      symbol: 'ETH',
      decimals: 18,
    },
    contracts: {}, // Sepolia deployed addresses when targetting public testnet
  },
};

export const DEFAULT_CHAIN_ID = 31337;

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
  // For local Anvil, provide direct RPC inspector URL or block identifier
  return `http://127.0.0.1:8545#tx/${txHash}`;
}

export function getExplorerAddressUrl(address: string, chainId: number = DEFAULT_CHAIN_ID): string {
  const net = SUPPORTED_NETWORKS[chainId];
  if (net?.explorerUrl) {
    return `${net.explorerUrl}/address/${address}`;
  }
  return `http://127.0.0.1:8545#address/${address}`;
}
