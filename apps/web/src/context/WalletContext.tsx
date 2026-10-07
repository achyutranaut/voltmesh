import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  Address,
  Abi,
  Hash,
  Hex,
  TransactionReceipt,
  createPublicClient,
  http,
  formatEther,
  formatUnits,
  parseUnits,
  parseEther,
  keccak256,
  encodePacked,
  toHex,
  decodeErrorResult,
} from 'viem';
import {
  SUPPORTED_NETWORKS,
  DEFAULT_CHAIN_ID,
  voltmeshTestnet,
  getContract,
  getExplorerTxUrl,
  getExplorerAddressUrl,
} from '../config/contracts';
import { privateKeyToAccount } from 'viem/accounts';
import { assertTestnet, assertNoEth } from '../config/network';
import deploymentArtifacts from '../contracts/deployments.json';
import { ParticipantCapabilities } from '@energy-dex/types';
import { useSession } from '../auth/SessionContext';
import { can } from '../auth/permissions';

const ALL_CONTRACT_ABIS = Object.values(deploymentArtifacts.contracts).flatMap(
  (c: any) => c.abi || []
) as Abi;

// EIP-712 Types & Domain for VoltMesh Energy Orders
export const EIP712_DOMAIN = {
  name: 'VoltMesh Energy Exchange',
  version: '1',
  chainId: BigInt(DEFAULT_CHAIN_ID),
  verifyingContract: deploymentArtifacts.contracts.BatchSettlement.address as Address,
} as const;

export const EIP712_TYPES = {
  EnergyOrder: [
    { name: 'maker', type: 'address' },
    { name: 'zone', type: 'uint32' },
    { name: 'interval', type: 'uint32' },
    { name: 'side', type: 'uint8' },
    { name: 'quantityWh', type: 'uint64' },
    { name: 'pricePaisePerKWh', type: 'uint64' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
  ],
} as const;

export type TransactionStatus =
  | 'IDLE'
  | 'WALLET_DISCONNECTED'
  | 'WRONG_NETWORK'
  | 'RPC_UNAVAILABLE'
  | 'CONTRACT_UNAVAILABLE'
  | 'INSUFFICIENT_NATIVE_BALANCE'
  | 'GAS_ESTIMATION_FAILED'
  | 'AWAITING_WALLET'
  | 'SUBMITTED'
  | 'CONFIRMING'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'FAILED'
  | 'REVERTED';

export interface TransactionRecord {
  hash: Hash;
  description: string;
  status: TransactionStatus;
  timestamp: number;
  blockNumber?: bigint;
  error?: string;
}

export interface OnChainActivityItem {
  id: string;
  timestamp: string;
  event: string;
  details: string;
  txHash?: Hash;
  blockNumber?: string;
  type: 'order' | 'clearing' | 'escrow' | 'oracle' | 'certificate' | 'faucet';
}

export interface WalletRoles {
  isAdmin: boolean;
  isOperator: boolean;
  isOracle: boolean;
  isRegistrar: boolean;
  isParticipant: boolean;
}

export interface EscrowBalances {
  total: bigint;
  locked: bigint;
  free: bigint;
}

export interface UtilityIdentityClaim {
  consumerNumber: string;
  caNumber: string;
  sanctionedLoadKw: number;
  connectionPhase: 1 | 3;
  tariffCategory: string;
  discomId: string;
  netMeterInstalled: boolean;
  netMeterSerialNumber: string;
  solarCapacityKw: number;
  consumerType: 'PROSUMER' | 'CONSUMER';
  vcIssuer: string;
  vcStatus: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'INACTIVE';
}

export interface WalletContextType {
  // Connection state
  address: Address | null;
  chainId: number | null;
  isConnected: boolean;
  isCorrectNetwork: boolean;
  isConnecting: boolean;
  walletInstalled: boolean;
  error: string | null;

  // Utility Identity & India Energy Stack Verifiable Credential
  utilityIdentity: UtilityIdentityClaim;
  capabilities: ParticipantCapabilities;
  simulationMode: boolean;
  setSimulationMode: (enabled: boolean) => void;
  simulationRole: 'PROSUMER' | 'CONSUMER';
  setSimulationRole: (role: 'PROSUMER' | 'CONSUMER') => void;
  switchDemoRole: (role: 'SELLER' | 'BUYER') => void;

  // Balances & Roles
  ethBalance: bigint;
  tokenBalance: bigint; // vUSD test settlement stablecoin
  escrowBalances: EscrowBalances;
  roles: WalletRoles;

  // Actions
  connectMetaMask: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: (targetChainId?: number) => Promise<void>;
  refreshBalances: () => Promise<void>;
  requestNativeEthFaucet: (amountEth?: string) => Promise<void>;

  // EIP-712 Order Signing
  signEnergyOrder: (order: {
    zone: number;
    interval: number;
    side: number;
    quantityWh: bigint;
    pricePaisePerKWh: bigint;
    nonce?: bigint;
    expiry?: number;
  }) => Promise<{ signature: Hash; nonce: bigint; expiry: number; maker: Address }>;

  // Smart Contract Transaction Execution
  executeTransaction: (
    description: string,
    action: (walletClient: any, publicClient: any) => Promise<Hash>
  ) => Promise<{ hash: Hash; receipt: TransactionReceipt }>;

  // Robust Contract Transaction with Preflight Gas Estimation and EIP-1559 Fee Resolution
  executeContractTx: (opts: {
    description: string;
    address: Address;
    abi: Abi;
    functionName: string;
    args?: any[];
    value?: bigint;
  }) => Promise<{ hash: Hash; receipt: TransactionReceipt }>;

  // Dedicated High-Level Contract Actions
  mintTestTokens: (amount?: bigint) => Promise<Hash>;
  depositEscrow: (amount: bigint) => Promise<Hash>;
  withdrawEscrow: (amount: bigint) => Promise<Hash>;
  commitEpochOnChain: (
    zoneId: number,
    intervalIdx: number,
    merkleRoot: Hash,
    leafCount: number,
    totalWh: bigint,
    signatures: Hash[]
  ) => Promise<Hash>;
  commitClearingOnChain: (
    zoneId: number,
    intervalIdx: number,
    pricePaiseKWh: bigint,
    volumeWh: bigint,
    ordersRoot: Hash,
    obligationsRoot: Hash
  ) => Promise<Hash>;
  executeSettlementBatchOnChain: (opts: {
    zoneId: number;
    intervalIdx: number;
    dateEpoch?: number;
    statementRoot: Hash;
    totalCreditsPaise: bigint;
    totalDebitsPaise: bigint;
  }) => Promise<Hash>;
  cancelOrderOnChain: (nonce: bigint) => Promise<Hash>;
  claimCertificateOnChain: (
    zoneId: number,
    intervalIdx: number,
    deviceId: Hash,
    energyWh: bigint,
    sourceType: number,
    counter: bigint,
    proof: Hash[]
  ) => Promise<Hash>;
  transferCertificateOnChain: (to: Address, tokenId: bigint, amountWh: bigint) => Promise<Hash>;
  retireCertificateOnChain: (tokenId: bigint, amountWh: bigint, beneficiary: string, purpose: string) => Promise<Hash>;
  verifyLeafOnChain: (zoneId: number, intervalIdx: number, leafHash: Hash, proof: Hash[]) => Promise<boolean>;

  // Transaction Lifecycle & Activity stream
  activeTx: TransactionRecord | null;
  txHistory: TransactionRecord[];
  onChainActivity: OnChainActivityItem[];
  dismissActiveTx: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { session, signOut } = useSession();
  const address = session?.address ?? null;
  const walletClient = session?.walletClient;
  const isConnected = !!session;

  const [participantRoleType, setParticipantRoleType] = useState<number | null>(null);
  const [simulationMode, setSimulationMode] = useState<boolean>(false);
  const [simulationRole, setSimulationRole] = useState<'PROSUMER' | 'CONSUMER'>('PROSUMER');
  const [injectedChainId, setInjectedChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [walletInstalled, setWalletInstalled] = useState<boolean>(false);

  const chainId = session ? (session.kind === 'demo' ? DEFAULT_CHAIN_ID : (injectedChainId ?? null)) : (injectedChainId ?? null);

  // Cryptographic authority: address is strictly the connected session wallet
  const effectiveAddress = address;

  const switchDemoRole = useCallback((role: 'SELLER' | 'BUYER') => {
    setSimulationMode(true);
    setSimulationRole(role === 'SELLER' ? 'PROSUMER' : 'CONSUMER');
  }, []);

  // Balances
  const [ethBalance, setEthBalance] = useState<bigint>(0n);
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n);
  const [escrowBalances, setEscrowBalances] = useState<EscrowBalances>({ total: 0n, locked: 0n, free: 0n });

  // Roles
  const [roles, setRoles] = useState<WalletRoles>({
    isAdmin: false,
    isOperator: false,
    isOracle: false,
    isRegistrar: false,
    isParticipant: false,
  });

  // When session address changes, clear cached balances, activeTx, and onChainActivity
  useEffect(() => {
    setEthBalance(0n);
    setTokenBalance(0n);
    setEscrowBalances({ total: 0n, locked: 0n, free: 0n });
    setRoles({ isAdmin: false, isOperator: false, isOracle: false, isRegistrar: false, isParticipant: false });
    setActiveTx(null);
    setOnChainActivity([]);
  }, [session?.address]);

  const capabilities: ParticipantCapabilities = React.useMemo(() => {
    if (session?.role) {
      return {
        canBuy: can(session.role, 'order.buy'),
        canSell: can(session.role, 'order.sell'),
        canRegisterDevice: can(session.role, 'meter.generate'),
        canClearMarket: can(session.role, 'market.clear'),
        canOperate: can(session.role, 'epoch.build') || can(session.role, 'fault.inject'),
        canIssueCredentials: session.role === 'discom',
        canAudit: session.role === 'regulator' || session.role === 'discom',
      };
    }

    if (simulationMode) {
      return {
        canBuy: true,
        canSell: simulationRole === 'PROSUMER',
        canRegisterDevice: simulationRole === 'PROSUMER',
        canClearMarket: false,
        canOperate: false,
        canIssueCredentials: false,
        canAudit: false,
      };
    }

    if (roles.isAdmin || roles.isOperator) {
      return {
        canBuy: true,
        canSell: true,
        canRegisterDevice: true,
        canClearMarket: true,
        canOperate: true,
        canIssueCredentials: true,
        canAudit: true,
      };
    }

    if (roles.isParticipant && participantRoleType !== null) {
      if (participantRoleType === 1) {
        // PROSUMER
        return {
          canBuy: true,
          canSell: true,
          canRegisterDevice: true,
          canClearMarket: false,
          canOperate: false,
          canIssueCredentials: false,
          canAudit: false,
        };
      } else if (participantRoleType === 0) {
        // CONSUMER
        return {
          canBuy: true,
          canSell: false,
          canRegisterDevice: false,
          canClearMarket: false,
          canOperate: false,
          canIssueCredentials: false,
          canAudit: false,
        };
      } else if (participantRoleType === 2) {
        // DISCOM OPERATOR
        return {
          canBuy: false,
          canSell: false,
          canRegisterDevice: true,
          canClearMarket: false,
          canOperate: false,
          canIssueCredentials: true,
          canAudit: true,
        };
      }
    }

    // Default when wallet is connected but not registered on-chain
    return {
      canBuy: false,
      canSell: false,
      canRegisterDevice: false,
      canClearMarket: false,
      canOperate: false,
      canIssueCredentials: false,
      canAudit: false,
    };
  }, [session, simulationMode, simulationRole, roles, participantRoleType]);

  const utilityIdentity: UtilityIdentityClaim = React.useMemo(() => {
    const addr = (effectiveAddress ?? '').toLowerCase();
    if (!addr) {
      return {
        consumerNumber: '',
        caNumber: '',
        sanctionedLoadKw: 0,
        connectionPhase: 1,
        tariffCategory: 'Unconnected',
        discomId: 'TPDDL',
        netMeterInstalled: false,
        netMeterSerialNumber: '',
        solarCapacityKw: 0,
        consumerType: 'CONSUMER',
        vcIssuer: '',
        vcStatus: 'INACTIVE',
      };
    }

    if (simulationMode) {
      if (simulationRole === 'PROSUMER') {
        return {
          consumerNumber: '1002345678',
          caNumber: 'CA-DL-990123',
          sanctionedLoadKw: 10,
          connectionPhase: 3,
          tariffCategory: 'Domestic (LT-1) [Simulation Mode]',
          discomId: 'TPDDL',
          netMeterInstalled: true,
          netMeterSerialNumber: 'MTR-LNT-998811',
          solarCapacityKw: 8,
          consumerType: 'PROSUMER',
          vcIssuer: 'did:voltmesh:simulation',
          vcStatus: 'ACTIVE',
        };
      } else {
        return {
          consumerNumber: '1008765432',
          caNumber: 'CA-DL-990456',
          sanctionedLoadKw: 5,
          connectionPhase: 1,
          tariffCategory: 'Domestic (LT-1) [Simulation Mode]',
          discomId: 'TPDDL',
          netMeterInstalled: true,
          netMeterSerialNumber: 'MTR-SEC-112233',
          solarCapacityKw: 0,
          consumerType: 'CONSUMER',
          vcIssuer: 'did:voltmesh:simulation',
          vcStatus: 'ACTIVE',
        };
      }
    }

    if (roles.isParticipant && participantRoleType !== null) {
      if (participantRoleType === 1) {
        return {
          consumerNumber: '1002345678',
          caNumber: 'CA-DL-990123',
          sanctionedLoadKw: 10,
          connectionPhase: 3,
          tariffCategory: 'Domestic (LT-1)',
          discomId: 'TPDDL',
          netMeterInstalled: true,
          netMeterSerialNumber: 'MTR-LNT-998811',
          solarCapacityKw: 8,
          consumerType: 'PROSUMER',
          vcIssuer: 'did:discom:tpddl',
          vcStatus: 'ACTIVE',
        };
      } else {
        return {
          consumerNumber: '1008765432',
          caNumber: 'CA-DL-990456',
          sanctionedLoadKw: 5,
          connectionPhase: 1,
          tariffCategory: 'Domestic (LT-1)',
          discomId: 'TPDDL',
          netMeterInstalled: true,
          netMeterSerialNumber: 'MTR-SEC-112233',
          solarCapacityKw: 0,
          consumerType: 'CONSUMER',
          vcIssuer: 'did:discom:tpddl',
          vcStatus: 'ACTIVE',
        };
      }
    }

    return {
      consumerNumber: 'UNREGISTERED',
      caNumber: 'N/A',
      sanctionedLoadKw: 0,
      connectionPhase: 1,
      tariffCategory: 'Unregistered Participant',
      discomId: 'TPDDL',
      netMeterInstalled: false,
      netMeterSerialNumber: 'UNBOUND',
      solarCapacityKw: 0,
      consumerType: 'CONSUMER',
      vcIssuer: 'did:voltmesh:unregistered',
      vcStatus: 'INACTIVE',
    };
  }, [effectiveAddress, simulationMode, simulationRole, roles.isParticipant, participantRoleType]);

  // Transaction manager
  const [activeTx, setActiveTx] = useState<TransactionRecord | null>(null);
  const [txHistory, setTxHistory] = useState<TransactionRecord[]>([]);
  const [onChainActivity, setOnChainActivity] = useState<OnChainActivityItem[]>([]);

  // Public client connected to VoltMesh Testnet RPC
  const getPublicClient = useCallback(() => {
    return createPublicClient({
      chain: voltmeshTestnet,
      transport: http(SUPPORTED_NETWORKS[DEFAULT_CHAIN_ID].rpcUrl),
    });
  }, []);

  // Helper to record on-chain activity
  const recordActivity = useCallback((item: Omit<OnChainActivityItem, 'id' | 'timestamp'>) => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    const newItem: OnChainActivityItem = {
      ...item,
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: timeStr,
    };
    setOnChainActivity((prev) => [newItem, ...prev.slice(0, 49)]);
  }, []);

  // Check Ethereum provider on mount (chain detection only, no auto-connect)
  useEffect(() => {
    const ethereum = (window as any).ethereum;
    if (ethereum) {
      setWalletInstalled(true);

      // Read current chain
      ethereum.request({ method: 'eth_chainId' }).then((idHex: string) => {
        setInjectedChainId(parseInt(idHex, 16));
      }).catch(() => {});

      const handleChainChanged = (idHex: string) => {
        setInjectedChainId(parseInt(idHex, 16));
      };

      ethereum.on?.('chainChanged', handleChainChanged);

      return () => {
        ethereum.removeListener?.('chainChanged', handleChainChanged);
      };
    }
  }, []);

  // Refresh balances whenever address or chainId changes
  const refreshBalances = useCallback(async () => {
    if (!address) {
      setEthBalance(0n);
      setTokenBalance(0n);
      setEscrowBalances({ total: 0n, locked: 0n, free: 0n });
      setRoles({ isAdmin: false, isOperator: false, isOracle: false, isRegistrar: false, isParticipant: false });
      setParticipantRoleType(null);
      return;
    }

    try {
      const publicClient = getPublicClient();

      // 1. Native ETH balance
      const ethBal = await publicClient.getBalance({ address });
      setEthBalance(ethBal);

      // 2. MockERC20 token balance
      const tokenContract = getContract('MockERC20', DEFAULT_CHAIN_ID);
      if (tokenContract) {
        try {
          const tokBal = (await publicClient.readContract({
            address: tokenContract.address,
            abi: tokenContract.abi,
            functionName: 'balanceOf',
            args: [address],
          })) as bigint;
          setTokenBalance(tokBal);
        } catch (e) {
          console.warn('Failed to read token balance:', e);
        }
      }

      // 3. Escrow balances
      const escrowContract = getContract('Escrow', DEFAULT_CHAIN_ID);
      if (escrowContract) {
        try {
          const totalBal = (await publicClient.readContract({
            address: escrowContract.address,
            abi: escrowContract.abi,
            functionName: 'balances',
            args: [address],
          })) as bigint;

          const lockedBal = (await publicClient.readContract({
            address: escrowContract.address,
            abi: escrowContract.abi,
            functionName: 'lockedBalances',
            args: [address],
          })) as bigint;

          const freeBal = (await publicClient.readContract({
            address: escrowContract.address,
            abi: escrowContract.abi,
            functionName: 'getFreeBalance',
            args: [address],
          })) as bigint;

          setEscrowBalances({ total: totalBal, locked: lockedBal, free: freeBal });
        } catch (e) {
          console.warn('Failed to read escrow balances:', e);
        }
      }

      // 4. Roles from AccessRegistry & ParticipantRegistry
      const accessContract = getContract('AccessRegistry', DEFAULT_CHAIN_ID);
      const participantContract = getContract('ParticipantRegistry', DEFAULT_CHAIN_ID);

      let isAdmin = false;
      let isOperator = false;
      let isOracle = false;
      let isRegistrar = false;
      let isParticipant = false;

      if (accessContract) {
        try {
          const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hash;
          const OPERATOR_ROLE = keccak256(toHex('OPERATOR_ROLE'));
          const ORACLE_ROLE = keccak256(toHex('ORACLE_ROLE'));
          const REGISTRAR_ROLE = keccak256(toHex('REGISTRAR_ROLE'));

          const [hasAdmin, hasOp, hasOra, hasReg] = await Promise.all([
            publicClient.readContract({
              address: accessContract.address,
              abi: accessContract.abi,
              functionName: 'hasRole',
              args: [DEFAULT_ADMIN_ROLE, address],
            }) as Promise<boolean>,
            publicClient.readContract({
              address: accessContract.address,
              abi: accessContract.abi,
              functionName: 'hasRole',
              args: [OPERATOR_ROLE, address],
            }) as Promise<boolean>,
            publicClient.readContract({
              address: accessContract.address,
              abi: accessContract.abi,
              functionName: 'hasRole',
              args: [ORACLE_ROLE, address],
            }) as Promise<boolean>,
            publicClient.readContract({
              address: accessContract.address,
              abi: accessContract.abi,
              functionName: 'hasRole',
              args: [REGISTRAR_ROLE, address],
            }) as Promise<boolean>,
          ]);

          isAdmin = hasAdmin;
          isOperator = hasOp;
          isOracle = hasOra;
          isRegistrar = hasReg;
        } catch (e) {
          console.warn('Failed to read access roles:', e);
        }
      }

      let onChainRoleType: number | null = null;
      if (participantContract) {
        try {
          isParticipant = (await publicClient.readContract({
            address: participantContract.address,
            abi: participantContract.abi,
            functionName: 'isRegisteredAndActive',
            args: [address],
          })) as boolean;

          const pRecord = (await publicClient.readContract({
            address: participantContract.address,
            abi: participantContract.abi,
            functionName: 'participants',
            args: [address],
          })) as [string, number, number, string, boolean, bigint];

          if (pRecord && pRecord[5] > 0n && !pRecord[4]) {
            onChainRoleType = Number(pRecord[2]); // 0 = CONSUMER, 1 = PROSUMER, 2 = DISCOM_OPERATOR
          }
        } catch (e) {
          console.warn('Failed to read participant status:', e);
        }
      }

      setParticipantRoleType(onChainRoleType);
      setRoles({ isAdmin, isOperator, isOracle, isRegistrar, isParticipant });
    } catch (e) {
      console.warn('Error refreshing blockchain balances:', e);
    }
  }, [address, getPublicClient]);

  useEffect(() => {
    refreshBalances();
    const interval = setInterval(refreshBalances, 6000);
    return () => clearInterval(interval);
  }, [refreshBalances]);

  // Connect MetaMask - opens the identity gate
  const connectMetaMask = async () => {
    window.dispatchEvent(new Event('voltmesh:open-gate'));
  };

  // Disconnect
  const disconnect = () => {
    if (session?.address) {
      signOut(session.address);
    } else {
      signOut();
    }
    setError(null);
  };

  // Programmatic Network Switch
  const switchNetwork = async (targetChainId: number = DEFAULT_CHAIN_ID) => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    const hexChainId = `0x${targetChainId.toString(16)}`;
    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }],
      });
      setInjectedChainId(targetChainId);
    } catch (switchError: any) {
      // 4902 indicates chain not added yet to MetaMask
      if (switchError.code === 4902) {
        const net = SUPPORTED_NETWORKS[targetChainId];
        if (net) {
          try {
            await ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: hexChainId,
                  chainName: net.name,
                  nativeCurrency: net.currency,
                  rpcUrls: [net.rpcUrl],
                  blockExplorerUrls: net.explorerUrl ? [net.explorerUrl] : undefined,
                },
              ],
            });
            setInjectedChainId(targetChainId);
          } catch (addError: any) {
            setError(`Failed to add network: ${addError.message}`);
          }
        }
      } else {
        setError(`Failed to switch network: ${switchError.message}`);
      }
    }
  };

  // Helper to extract clean human-readable revert reasons from EVM contracts
  const extractRevertReason = (err: any, abi?: Abi): string => {
    if (!err) return 'Unknown transaction error';

    // Helper to format decoded error
    const formatDecoded = (decoded: { errorName: string; args?: readonly any[] | any[] }): string => {
      const { errorName, args } = decoded;
      if (errorName === 'StaleEpochNotAllowed') {
        return `Epoch submission rejected: Interval ${args?.[0]} is stale (current on-chain interval is ${args?.[1]}).`;
      }
      if (errorName === 'FutureEpochNotAllowed') {
        return `Epoch submission rejected: Interval ${args?.[0]} is in the future (current on-chain interval is ${args?.[1]}).`;
      }
      if (errorName === 'EpochAlreadyFinalized') {
        return `Epoch for Zone ${args?.[0]} Slot ${args?.[1]} is already finalized on-chain.`;
      }
      if (errorName === 'SignerNotAuthorizedOracle') {
        return `Signer ${args?.[0]} is not an authorized oracle in AccessRegistry.`;
      }
      if (errorName === 'InsufficientSignatures') {
        return `Insufficient oracle signatures: received ${args?.[0]}, required ${args?.[1]}.`;
      }
      if (errorName === 'DuplicateOrUnsortedSigner') {
        return `Duplicate or unsorted oracle signer: ${args?.[0]}.`;
      }
      if (errorName === 'EpochNotFound') {
        return `Epoch for Zone ${args?.[0]} Slot ${args?.[1]} not found on-chain.`;
      }
      if (errorName === 'InsufficientBalance') {
        return `Insufficient balance: available ${args?.[1]}, requested ${args?.[2]}.`;
      }
      if (errorName === 'ECDSAInvalidSignature') {
        return 'Invalid cryptographic ECDSA signature.';
      }
      if (errorName === 'SystemPaused') {
        return 'VoltMesh smart contracts are currently paused by administrative action.';
      }
      if (errorName === 'CallerNotAdmin') {
        return 'Unauthorized: caller does not have Administrator privileges.';
      }
      if (errorName === 'CallerNotOperator') {
        return 'Unauthorized: caller does not have Market Operator privileges.';
      }
      if (errorName === 'CallerNotAuditor') {
        return 'Unauthorized: caller does not have Auditor / Regulator privileges.';
      }
      if (errorName === 'CommitmentAlreadyExists') {
        return `Market clearing commitment already exists for Zone ${args?.[0]} Slot ${args?.[1]}.`;
      }
      if (errorName === 'StatementAlreadyPosted') {
        return `Daily settlement statement already posted for Date ${args?.[0]} Zone ${args?.[1]}.`;
      }
      if (errorName === 'LeafAlreadyClaimed') {
        return 'Settlement leaf has already been claimed.';
      }
      if (errorName === 'InvalidMerkleProof') {
        return 'Invalid cryptographic Merkle proof.';
      }
      if (errorName === 'ParticipantNotActive') {
        return `Participant ${args?.[0]} is suspended or not registered.`;
      }
      if (errorName === 'EconomicConservationViolation') {
        return `Settlement violates economic conservation (debits: ${args?.[0]}, credits: ${args?.[1]}).`;
      }
      if (errorName === 'SettlementPoolExhausted') {
        return 'Settlement liquidity pool has insufficient reserves.';
      }
      if (errorName === 'DeviceNotRegisteredOrRevoked') {
        return `Smart meter device ${args?.[0]} is not registered or has been revoked.`;
      }
      if (errorName === 'ExceedsRatedCapacity') {
        return `Energy volume exceeds smart meter rated capacity.`;
      }
      if (errorName === 'MismatchedSourceType') {
        return 'Energy source type mismatch for certificate generation.';
      }
      if (errorName === 'UnauthorizedClaimant') {
        return 'Only the registered device owner or market operator can claim certificates.';
      }
      if (errorName === 'LeafAlreadyMinted') {
        return 'Energy attribute certificate has already been minted for this reading.';
      }
      if (errorName === 'InvalidOracleProof') {
        return 'Oracle Merkle proof failed verification against on-chain epoch root.';
      }
      if (args && args.length > 0) {
        return `${errorName}(${args.join(', ')})`;
      }
      return errorName;
    };

    // 1. Check if Viem already decoded error on the error object
    if (err.errorName) {
      return formatDecoded(err);
    }
    if (err.cause?.errorName) {
      return formatDecoded(err.cause);
    }
    if (err.cause?.data?.errorName) {
      return formatDecoded(err.cause.data);
    }
    if (err.data?.errorName) {
      return formatDecoded(err.data);
    }
    if (typeof err.walk === 'function') {
      const walkedWithNamedError = err.walk((e: any) => Boolean(e?.data?.errorName || e?.errorName));
      if (walkedWithNamedError) {
        if (walkedWithNamedError.data?.errorName) {
          return formatDecoded(walkedWithNamedError.data);
        }
        if (walkedWithNamedError.errorName) {
          return formatDecoded(walkedWithNamedError);
        }
      }
    }

    // 2. Collect candidate raw hex data
    const rawCandidates: (`0x${string}`)[] = [];
    const directData =
      typeof err.data === 'string' && err.data.startsWith('0x')
        ? err.data
        : typeof err.cause?.data === 'string' && err.cause.data.startsWith('0x')
        ? err.cause.data
        : typeof err.cause?.cause?.data === 'string' && err.cause.cause.data.startsWith('0x')
        ? err.cause.cause.data
        : null;
    if (directData) {
      rawCandidates.push(directData as `0x${string}`);
    }

    const msg = `${err.shortMessage || ''} ${err.message || ''}`;
    const hexMatches = msg.match(/0x[a-fA-F0-9]{8,}/g);
    if (hexMatches) {
      for (const h of hexMatches) {
        if (!rawCandidates.includes(h as `0x${string}`)) {
          rawCandidates.push(h as `0x${string}`);
        }
      }
    }

    // 3. Attempt decoding against provided ABI or all contract ABIs
    const abisToTry = abi ? [abi, ALL_CONTRACT_ABIS] : [ALL_CONTRACT_ABIS];
    for (const rawData of rawCandidates) {
      for (const targetAbi of abisToTry) {
        try {
          const decoded = decodeErrorResult({ abi: targetAbi, data: rawData });
          if (decoded?.errorName) {
            return formatDecoded(decoded);
          }
        } catch {}
      }
    }

    // 4. Match well-known selector signatures
    if (msg.includes('0xcbcda9e9')) {
      return 'Epoch submission rejected: Interval is stale (StaleEpochNotAllowed: submitted interval is older than maximum lag).';
    }
    if (msg.includes('0xe43937da')) {
      return 'Epoch is already finalized on-chain for this Zone and Slot (EpochAlreadyFinalized).';
    }
    if (msg.includes('0xf645eedf')) {
      return 'Invalid cryptographic ECDSA signature provided (ECDSAInvalidSignature).';
    }
    if (msg.includes('0x1ecf66f1')) {
      return 'Signer is not an authorized oracle in AccessRegistry (SignerNotAuthorizedOracle).';
    }
    if (msg.includes('0xf1e86aa6')) {
      return 'Insufficient signatures provided (InsufficientSignatures).';
    }
    if (msg.includes('0x729e4c40')) {
      return 'VoltMesh smart contracts are currently paused (SystemPaused).';
    }

    return err.shortMessage || err.message || 'Execution reverted by EVM contract.';
  };

  // Fund connected MetaMask account with 10 ETH from Local Devnet Faucet (Anvil)
  const requestNativeEthFaucet = async (amountEth: string = '10') => {
    if (!address) {
      throw new Error('MetaMask wallet must be connected to request gas.');
    }
    try {
      const rpcUrl = SUPPORTED_NETWORKS[DEFAULT_CHAIN_ID].rpcUrl;
      const weiHex = toHex(parseEther(amountEth));
      await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'anvil_setBalance',
          params: [address, weiHex],
        }),
      });
      await refreshBalances();
      recordActivity({
        event: 'NativeFaucetFunded',
        details: `Funded ${amountEth} ETH native gas via Local Devnet Faucet`,
        type: 'faucet',
      });
    } catch (err: any) {
      console.error('Failed to fund native ETH via Anvil faucet:', err);
      throw err;
    }
  };

  // Robust Smart Contract Transaction Execution Lifecycle
  const executeContractTx = async (opts: {
    description: string;
    address: Address;
    abi: Abi;
    functionName: string;
    args?: any[];
    value?: bigint;
  }): Promise<{ hash: Hash; receipt: TransactionReceipt }> => {
    assertTestnet(chainId);
    assertNoEth(opts.value);

    if (!address || !walletClient) {
      const errRecord: TransactionRecord = {
        hash: '0x' as Hash,
        description: opts.description,
        status: 'WALLET_DISCONNECTED',
        timestamp: Date.now(),
        error: 'Wallet is not connected. Please verify identity in the gate.',
      };
      setActiveTx(errRecord);
      setTxHistory((prev) => [errRecord, ...prev.slice(0, 19)]);
      throw new Error('Wallet is not connected.');
    }

    if (chainId !== DEFAULT_CHAIN_ID) {
      const errRecord: TransactionRecord = {
        hash: '0x' as Hash,
        description: opts.description,
        status: 'WRONG_NETWORK',
        timestamp: Date.now(),
        error: `Connected to wrong network (${chainId}). Please switch to VoltMesh Testnet (${DEFAULT_CHAIN_ID}).`,
      };
      setActiveTx(errRecord);
      setTxHistory((prev) => [errRecord, ...prev.slice(0, 19)]);
      throw new Error(`Connected to wrong network. Expected ${DEFAULT_CHAIN_ID}`);
    }

    const publicClient = getPublicClient();

    // 1. Verify RPC is alive
    try {
      await publicClient.getBlockNumber();
    } catch (rpcErr) {
      const errRecord: TransactionRecord = {
        hash: '0x' as Hash,
        description: opts.description,
        status: 'RPC_UNAVAILABLE',
        timestamp: Date.now(),
        error: `VoltMesh RPC (${SUPPORTED_NETWORKS[DEFAULT_CHAIN_ID].rpcUrl}) is unreachable. Ensure local node is running.`,
      };
      setActiveTx(errRecord);
      setTxHistory((prev) => [errRecord, ...prev.slice(0, 19)]);
      throw new Error('RPC unavailable');
    }

    // 2. Verify target contract is deployed
    const code = await publicClient.getCode({ address: opts.address });
    if (!code || code === '0x') {
      const errRecord: TransactionRecord = {
        hash: '0x' as Hash,
        description: opts.description,
        status: 'CONTRACT_UNAVAILABLE',
        timestamp: Date.now(),
        error: `Target contract at ${opts.address} is not deployed on this network.`,
      };
      setActiveTx(errRecord);
      setTxHistory((prev) => [errRecord, ...prev.slice(0, 19)]);
      throw new Error(`Contract at ${opts.address} is not deployed.`);
    }

    // 3. Verify native gas balance
    const currentEth = await publicClient.getBalance({ address });
    if (currentEth === 0n) {
      const errRecord: TransactionRecord = {
        hash: '0x' as Hash,
        description: opts.description,
        status: 'INSUFFICIENT_NATIVE_BALANCE',
        timestamp: Date.now(),
        error: 'Connected account has 0 ETH on chain 31337 to pay for gas. Please click "Fund 10 ETH Faucet" to fund your account.',
      };
      setActiveTx(errRecord);
      setTxHistory((prev) => [errRecord, ...prev.slice(0, 19)]);
      throw new Error('Insufficient native balance for gas');
    }

    // 4. Pre-flight gas estimation via RPC (catches contract reverts BEFORE MetaMask)
    let estimatedGas: bigint;
    try {
      estimatedGas = await publicClient.estimateContractGas({
        address: opts.address,
        abi: opts.abi,
        functionName: opts.functionName,
        args: opts.args,
        account: address,
        value: opts.value,
      });
    } catch (estError: any) {
      console.error('VoltMesh transaction gas estimation failed', {
        error: estError,
        chainId,
        rpcUrl: SUPPORTED_NETWORKS[DEFAULT_CHAIN_ID].rpcUrl,
        walletAddress: address,
        contractAddress: opts.address,
        functionName: opts.functionName,
        args: opts.args,
      });

      const friendlyMsg = extractRevertReason(estError, opts.abi);
      const errRecord: TransactionRecord = {
        hash: '0x' as Hash,
        description: opts.description,
        status: 'GAS_ESTIMATION_FAILED',
        timestamp: Date.now(),
        error: `Gas estimation failed: ${friendlyMsg}`,
      };
      setActiveTx(errRecord);
      setTxHistory((prev) => [errRecord, ...prev.slice(0, 19)]);
      throw new Error(`Gas estimation failed: ${friendlyMsg}`);
    }

    // 5. Query live gas fee parameters from RPC (EIP-1559 base fee / gas price)
    let feeParams: any = {};
    try {
      const fees = await publicClient.estimateFeesPerGas();
      if (fees.maxFeePerGas && fees.maxPriorityFeePerGas) {
        feeParams.maxFeePerGas = fees.maxFeePerGas;
        feeParams.maxPriorityFeePerGas = fees.maxPriorityFeePerGas;
      }
    } catch {
      try {
        feeParams.gasPrice = await publicClient.getGasPrice();
      } catch {}
    }

    // Apply safe 20% buffer on estimated gas limit so MetaMask receives explicit, valid gas parameters
    const gasLimit = (estimatedGas * 120n) / 100n;

    // 6. Request transaction
    const pendingRecord: TransactionRecord = {
      hash: '0x' as Hash,
      description: opts.description,
      status: 'AWAITING_WALLET',
      timestamp: Date.now(),
    };
    setActiveTx(pendingRecord);

    try {
      const txHash = await (walletClient as any).writeContract({
        account: address,
        address: opts.address,
        abi: opts.abi,
        functionName: opts.functionName,
        args: opts.args,
        value: opts.value,
        gas: gasLimit,
        ...feeParams,
      });

      const submittedRecord: TransactionRecord = {
        ...pendingRecord,
        hash: txHash,
        status: 'SUBMITTED',
      };
      setActiveTx(submittedRecord);

      setActiveTx((prev) => (prev ? { ...prev, status: 'CONFIRMING' } : null));

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      });

      const confirmedRecord: TransactionRecord = {
        hash: txHash,
        description: opts.description,
        status: receipt.status === 'success' ? 'CONFIRMED' : 'REVERTED',
        timestamp: Date.now(),
        blockNumber: receipt.blockNumber,
      };

      setActiveTx(confirmedRecord);
      setTxHistory((prev) => [confirmedRecord, ...prev.slice(0, 19)]);

      await refreshBalances();
      return { hash: txHash, receipt };
    } catch (err: any) {
      const isRejection = err.code === 4001 || err.message?.includes('User rejected');
      const failedRecord: TransactionRecord = {
        ...pendingRecord,
        status: isRejection ? 'REJECTED' : 'FAILED',
        error: isRejection
          ? 'Transaction declined in MetaMask.'
          : err.shortMessage || err.message || 'Transaction execution failed',
      };
      setActiveTx(failedRecord);
      setTxHistory((prev) => [failedRecord, ...prev.slice(0, 19)]);
      throw err;
    }
  };

  // Generic Smart Contract Transaction Execution Lifecycle (Backwards Compatibility)
  const executeTransaction = async (
    description: string,
    action: (walletClient: any, publicClient: any) => Promise<Hash>
  ): Promise<{ hash: Hash; receipt: TransactionReceipt }> => {
    assertTestnet(chainId);

    if (!address || !walletClient) {
      const errRecord: TransactionRecord = {
        hash: '0x' as Hash,
        description,
        status: 'WALLET_DISCONNECTED',
        timestamp: Date.now(),
        error: 'Wallet is not connected.',
      };
      setActiveTx(errRecord);
      throw new Error('Wallet is not connected.');
    }

    const publicClient = getPublicClient();

    const pendingRecord: TransactionRecord = {
      hash: '0x' as Hash,
      description,
      status: 'AWAITING_WALLET',
      timestamp: Date.now(),
    };
    setActiveTx(pendingRecord);

    try {
      const txHash = await action(walletClient, publicClient);

      const submittedRecord: TransactionRecord = {
        ...pendingRecord,
        hash: txHash,
        status: 'SUBMITTED',
      };
      setActiveTx(submittedRecord);

      setActiveTx((prev) => (prev ? { ...prev, status: 'CONFIRMING' } : null));

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      });

      const confirmedRecord: TransactionRecord = {
        hash: txHash,
        description,
        status: receipt.status === 'success' ? 'CONFIRMED' : 'REVERTED',
        timestamp: Date.now(),
        blockNumber: receipt.blockNumber,
      };

      setActiveTx(confirmedRecord);
      setTxHistory((prev) => [confirmedRecord, ...prev.slice(0, 19)]);

      await refreshBalances();
      return { hash: txHash, receipt };
    } catch (err: any) {
      const isRejection = err.code === 4001 || err.message?.includes('User rejected');
      const failedRecord: TransactionRecord = {
        ...pendingRecord,
        status: isRejection ? 'REJECTED' : 'FAILED',
        error: isRejection ? 'Transaction declined in wallet.' : err.shortMessage || err.message || 'Execution failed',
      };
      setActiveTx(failedRecord);
      setTxHistory((prev) => [failedRecord, ...prev.slice(0, 19)]);
      throw err;
    }
  };

  // EIP-712 Order Signing
  const signEnergyOrder = async (order: {
    zone: number;
    interval: number;
    side: number;
    quantityWh: bigint;
    pricePaisePerKWh: bigint;
    nonce?: bigint;
    expiry?: number;
  }): Promise<{ signature: Hash; nonce: bigint; expiry: number; maker: Address }> => {
    if (!address || !walletClient) {
      throw new Error('Wallet must be connected to sign energy orders.');
    }

    const nonce = order.nonce ?? BigInt(Date.now());
    const expiry = order.expiry ?? Math.floor(Date.now() / 1000) + 3600;

    const message = {
      maker: address,
      zone: order.zone,
      interval: order.interval,
      side: order.side,
      quantityWh: order.quantityWh,
      pricePaisePerKWh: order.pricePaisePerKWh,
      nonce,
      expiry: BigInt(expiry),
    };

    setActiveTx({
      hash: '0x' as Hash,
      description: `Sign EIP-712 Energy Order (${order.side === 0 ? 'BUY' : 'SELL'} ${order.quantityWh} Wh)`,
      status: 'AWAITING_WALLET',
      timestamp: Date.now(),
    });

    try {
      const signature = await (walletClient as any).signTypedData({
        account: address,
        domain: EIP712_DOMAIN,
        types: EIP712_TYPES,
        primaryType: 'EnergyOrder',
        message,
      });

      setActiveTx({
        hash: signature,
        description: `Order Signed by ${address.slice(0, 6)}...${address.slice(-4)}`,
        status: 'CONFIRMED',
        timestamp: Date.now(),
      });

      recordActivity({
        event: 'OrderAuthorized',
        details: `${order.side === 0 ? 'BUY' : 'SELL'} ${order.quantityWh} Wh @ ₹${(Number(order.pricePaisePerKWh) / 100).toFixed(2)}`,
        txHash: signature,
        type: 'order',
      });

      return { signature, nonce, expiry, maker: address };
    } catch (err: any) {
      setActiveTx({
        hash: '0x' as Hash,
        description: 'Order Signature Cancelled',
        status: 'REJECTED',
        timestamp: Date.now(),
        error: err.message,
      });
      throw err;
    }
  };

  // Mint Test Tokens (Faucet for Development)
  const mintTestTokens = async (amount: bigint = parseUnits('1000', 18)): Promise<Hash> => {
    const tokenContract = getContract('MockERC20', DEFAULT_CHAIN_ID);
    if (!tokenContract || !address) throw new Error('Contract or address not ready');

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.token) {
        headers['Authorization'] = `Bearer ${session.token}`;
      }
      const res = await fetch(`${apiUrl}/api/v1/faucet/mint`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          recipient: address,
          amountPaise: amount.toString(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const txHash = (data.txHash || '0x') as Hash;
        recordActivity({
          event: 'FaucetMinted',
          details: `Minted 1,000 vUSD settlement tokens via server faucet`,
          txHash,
          type: 'faucet',
        });
        await refreshBalances();
        return txHash;
      }
    } catch {
      // Fallback to direct client call if server faucet endpoint unreachable
    }

    // Direct contract execution fallback
    const { hash } = await executeContractTx({
      description: `Mint 1,000 Test vUSD to ${address.slice(0, 6)}...${address.slice(-4)}`,
      address: tokenContract.address,
      abi: tokenContract.abi,
      functionName: 'mint',
      args: [address, amount],
    });

    recordActivity({
      event: 'FaucetMinted',
      details: `Minted 1,000 vUSD settlement tokens`,
      txHash: hash,
      type: 'faucet',
    });

    return hash;
  };

  // Deposit Escrow Collateral
  const depositEscrow = async (amount: bigint): Promise<Hash> => {
    const tokenContract = getContract('MockERC20', DEFAULT_CHAIN_ID);
    const escrowContract = getContract('Escrow', DEFAULT_CHAIN_ID);
    if (!tokenContract || !escrowContract || !address) throw new Error('Contract not available');

    // 1. Check & execute ERC20 approval if needed
    const publicClient = getPublicClient();
    const allowance = (await publicClient.readContract({
      address: tokenContract.address,
      abi: tokenContract.abi,
      functionName: 'allowance',
      args: [address, escrowContract.address],
    })) as bigint;

    if (allowance < amount) {
      await executeContractTx({
        description: `Approve Escrow vault for ${formatUnits(amount, 18)} vUSD`,
        address: tokenContract.address,
        abi: tokenContract.abi,
        functionName: 'approve',
        args: [escrowContract.address, amount * 10n],
      });
    }

    // 2. Deposit into Escrow
    const { hash } = await executeContractTx({
      description: `Deposit ${formatUnits(amount, 18)} vUSD into Escrow vault`,
      address: escrowContract.address,
      abi: escrowContract.abi,
      functionName: 'deposit',
      args: [amount],
    });

    recordActivity({
      event: 'EscrowDeposited',
      details: `Locked ${formatUnits(amount, 18)} vUSD settlement collateral`,
      txHash: hash,
      type: 'escrow',
    });

    return hash;
  };

  // Withdraw Escrow Collateral
  const withdrawEscrow = async (amount: bigint): Promise<Hash> => {
    const escrowContract = getContract('Escrow', DEFAULT_CHAIN_ID);
    if (!escrowContract || !address) throw new Error('Contract not available');

    const { hash } = await executeContractTx({
      description: `Withdraw ${formatUnits(amount, 18)} vUSD from Escrow vault`,
      address: escrowContract.address,
      abi: escrowContract.abi,
      functionName: 'withdraw',
      args: [amount],
    });

    recordActivity({
      event: 'EscrowWithdrawn',
      details: `Released ${formatUnits(amount, 18)} vUSD from Escrow`,
      txHash: hash,
      type: 'escrow',
    });

    return hash;
  };

  // Commit Epoch On-Chain to EpochOracle
  const commitEpochOnChain = async (
    zoneId: number,
    intervalIdx: number,
    merkleRoot: Hash,
    leafCount: number,
    totalWh: bigint,
    signatures: Hash[]
  ): Promise<Hash> => {
    const oracleContract = getContract('EpochOracle', DEFAULT_CHAIN_ID);
    if (!oracleContract || !address) throw new Error('EpochOracle contract not available');

    const { hash } = await executeContractTx({
      description: `Commit Canonical Epoch ${zoneId}:${intervalIdx} Merkle Root to EpochOracle`,
      address: oracleContract.address,
      abi: oracleContract.abi,
      functionName: 'submitEpoch',
      args: [zoneId, intervalIdx, merkleRoot, leafCount, totalWh, signatures],
    });

    recordActivity({
      event: 'EpochSubmitted',
      details: `Zone ${zoneId} Slot ${intervalIdx} Root ${merkleRoot.slice(0, 10)}...`,
      txHash: hash,
      type: 'oracle',
    });

    return hash;
  };

  // Commit Clearing On-Chain to BatchSettlement
  const commitClearingOnChain = async (
    zoneId: number,
    intervalIdx: number,
    pricePaiseKWh: bigint,
    volumeWh: bigint,
    ordersRoot: Hash,
    obligationsRoot: Hash
  ): Promise<Hash> => {
    const settlementContract = getContract('BatchSettlement', DEFAULT_CHAIN_ID);
    if (!settlementContract || !address) throw new Error('BatchSettlement contract not available');

    const { hash } = await executeContractTx({
      description: `Commit Market Clearing for Interval ${intervalIdx} on-chain`,
      address: settlementContract.address,
      abi: settlementContract.abi,
      functionName: 'commitClearing',
      args: [zoneId, intervalIdx, pricePaiseKWh, volumeWh, ordersRoot, obligationsRoot],
    });

    recordActivity({
      event: 'ClearingCommitted',
      details: `Cleared ${volumeWh} Wh @ ₹${(Number(pricePaiseKWh) / 100).toFixed(2)}/kWh`,
      txHash: hash,
      type: 'clearing',
    });

    return hash;
  };

  // Cancel Order on BatchSettlement
  const cancelOrderOnChain = async (nonce: bigint): Promise<Hash> => {
    const settlementContract = getContract('BatchSettlement', DEFAULT_CHAIN_ID);
    if (!settlementContract || !address) throw new Error('BatchSettlement contract not available');

    const { hash } = await executeContractTx({
      description: `Cancel Order Nonce ${nonce.toString()} on-chain`,
      address: settlementContract.address,
      abi: settlementContract.abi,
      functionName: 'cancelOrder',
      args: [nonce],
    });

    recordActivity({
      event: 'OrderCancelledOnChain',
      details: `Cancelled Nonce ${nonce.toString()}`,
      txHash: hash,
      type: 'order',
    });

    return hash;
  };

  // Post Daily Settlement Statement on BatchSettlement (T+1 Settlement Finality)
  const executeSettlementBatchOnChain = async (opts: {
    zoneId: number;
    intervalIdx: number;
    dateEpoch?: number;
    statementRoot: Hash;
    totalCreditsPaise: bigint;
    totalDebitsPaise: bigint;
  }): Promise<Hash> => {
    const settlementContract = getContract('BatchSettlement', DEFAULT_CHAIN_ID);
    if (!settlementContract || !address) throw new Error('BatchSettlement contract not available');

    const publicClient = getPublicClient();
    let dateEpoch = opts.dateEpoch ?? Math.floor(Date.now() / 86400000);

    // If caller did not provide an explicit dateEpoch, and today's statement is already posted
    // (e.g. repeated local demo runs on the same calendar day), search up to 5 days ahead with bounded RPC checks.
    if (opts.dateEpoch === undefined) {
      try {
        const existing = (await publicClient.readContract({
          address: settlementContract.address,
          abi: settlementContract.abi,
          functionName: 'dailyStatements',
          args: [dateEpoch, opts.zoneId],
        })) as any;

        if (existing && (existing[7] > 0n || existing.postedAt > 0n)) {
          let attempts = 0;
          while (attempts < 5) {
            attempts++;
            dateEpoch++;
            const check = (await publicClient.readContract({
              address: settlementContract.address,
              abi: settlementContract.abi,
              functionName: 'dailyStatements',
              args: [dateEpoch, opts.zoneId],
            })) as any;
            if (!check || (check[7] === 0n && (check.postedAt === 0n || check.postedAt === undefined))) {
              console.info(`Using next available demo settlement epoch for zone ${opts.zoneId}: ${dateEpoch}`);
              break;
            }
          }
        }
      } catch (checkErr) {
        console.warn('Could not check existing dailyStatements:', checkErr);
      }
    }

    // postDailyStatement requires `quorumThreshold` oracle signatures (sorted ascending by signer
    // address) over keccak256(chainId, contract, dateEpoch, zoneId, root, credits, debits).
    // On the local devnet the quorum is 1 and the devnet oracle key (0x...0101, address
    // 0x25A71a07...) holds ORACLE_ROLE via scripts/seed-demo-accounts.ts.
    const oracleConfig = getContract('EpochOracle', DEFAULT_CHAIN_ID);
    if (!oracleConfig) throw new Error('EpochOracle contract not available');
    const quorum = (await getPublicClient().readContract({
      address: oracleConfig.address,
      abi: oracleConfig.abi,
      functionName: 'quorumThreshold',
    })) as bigint;
    if (quorum > 1n) {
      throw new Error(
        `Settlement requires ${quorum} oracle signatures; the in-browser devnet oracle can only supply 1.`
      );
    }

    const statementHash = keccak256(
      encodePacked(
        ['uint256', 'address', 'uint32', 'uint32', 'bytes32', 'uint256', 'uint256'],
        [
          BigInt(DEFAULT_CHAIN_ID),
          settlementContract.address,
          dateEpoch,
          opts.zoneId,
          opts.statementRoot,
          opts.totalCreditsPaise,
          opts.totalDebitsPaise,
        ]
      )
    );
    let oracleSignature: Hex | undefined;
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.token) {
        headers['Authorization'] = `Bearer ${session.token}`;
      }
      const res = await fetch(`${apiUrl}/api/v1/oracle/sign-statement`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          chainId: DEFAULT_CHAIN_ID,
          settlementContractAddress: settlementContract.address,
          dateEpoch,
          zoneId: opts.zoneId,
          statementRoot: opts.statementRoot,
          totalCreditsPaise: opts.totalCreditsPaise.toString(),
          totalDebitsPaise: opts.totalDebitsPaise.toString(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        oracleSignature = data.signature;
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Oracle signing request rejected: ${res.status}`);
      }
    } catch (err: any) {
      throw new Error(err?.message || 'Oracle signature service unavailable. Private oracle key is not exposed in web bundle.');
    }

    if (!oracleSignature) {
      throw new Error('Oracle signature service returned empty signature.');
    }

    const { hash } = await executeContractTx({
      description: `Post Daily Settlement Statement for Zone ${opts.zoneId} Slot ${opts.intervalIdx}`,
      address: settlementContract.address,
      abi: settlementContract.abi,
      functionName: 'postDailyStatement',
      args: [
        dateEpoch,
        opts.zoneId,
        opts.statementRoot,
        opts.totalCreditsPaise,
        opts.totalDebitsPaise,
        [oracleSignature],
      ],
    });

    recordActivity({
      event: 'DailyStatementPosted',
      details: `Settlement statement posted for Zone ${opts.zoneId} (Credits: ₹${(Number(opts.totalCreditsPaise) / 100).toFixed(2)})`,
      txHash: hash,
      type: 'clearing',
    });

    return hash;
  };

  // Claim GAC Certificate on CertificateRegistry (ERC-1155)
  const claimCertificateOnChain = async (
    zoneId: number,
    intervalIdx: number,
    deviceId: Hash,
    energyWh: bigint,
    sourceType: number,
    counter: bigint,
    proof: Hash[]
  ): Promise<Hash> => {
    const certContract = getContract('CertificateRegistry', DEFAULT_CHAIN_ID);
    if (!certContract || !address) throw new Error('CertificateRegistry contract not available');

    const { hash } = await executeContractTx({
      description: `Claim ERC-1155 Granular Attribute Certificate (${energyWh} Wh)`,
      address: certContract.address,
      abi: certContract.abi,
      functionName: 'claimCertificate',
      args: [zoneId, intervalIdx, deviceId, energyWh, sourceType, counter, proof],
    });

    recordActivity({
      event: 'CertificateMinted',
      details: `Minted ${energyWh} Wh GAC (ERC-1155) to ${address.slice(0, 6)}...`,
      txHash: hash,
      type: 'certificate',
    });

    return hash;
  };

  // Transfer Certificate (ERC-1155 safeTransferFrom)
  const transferCertificateOnChain = async (
    to: Address,
    tokenId: bigint,
    amountWh: bigint
  ): Promise<Hash> => {
    const certContract = getContract('CertificateRegistry', DEFAULT_CHAIN_ID);
    if (!certContract || !address) throw new Error('CertificateRegistry contract not available');

    const { hash } = await executeContractTx({
      description: `Transfer ${amountWh} Wh Certificate to ${to.slice(0, 6)}...${to.slice(-4)}`,
      address: certContract.address,
      abi: certContract.abi,
      functionName: 'safeTransferFrom',
      args: [address, to, tokenId, amountWh, '0x'],
    });

    recordActivity({
      event: 'CertificateTransferred',
      details: `Transferred ${amountWh} Wh GAC to ${to.slice(0, 6)}...`,
      txHash: hash,
      type: 'certificate',
    });

    return hash;
  };

  // Retire Certificate on RetirementRegistry
  const retireCertificateOnChain = async (
    tokenId: bigint,
    amountWh: bigint,
    beneficiary: string,
    purpose: string
  ): Promise<Hash> => {
    const retContract = getContract('RetirementRegistry', DEFAULT_CHAIN_ID);
    if (!retContract || !address) throw new Error('RetirementRegistry contract not available');

    const { hash } = await executeContractTx({
      description: `Permanently Retire ${amountWh} Wh GAC for ${beneficiary}`,
      address: retContract.address,
      abi: retContract.abi,
      functionName: 'retire',
      args: [tokenId, amountWh, beneficiary, purpose],
    });

    recordActivity({
      event: 'CertificateRetired',
      details: `Retired ${amountWh} Wh GAC for "${beneficiary}" (${purpose})`,
      txHash: hash,
      type: 'certificate',
    });

    return hash;
  };

  // Verify Leaf on-chain against EpochOracle
  const verifyLeafOnChain = async (
    zoneId: number,
    intervalIdx: number,
    leafHash: Hash,
    proof: Hash[]
  ): Promise<boolean> => {
    const oracleContract = getContract('EpochOracle', DEFAULT_CHAIN_ID);
    if (!oracleContract) return false;

    const publicClient = getPublicClient();
    try {
      const isValid = (await publicClient.readContract({
        address: oracleContract.address,
        abi: oracleContract.abi,
        functionName: 'verifyLeafInclusion',
        args: [zoneId, intervalIdx, leafHash, proof],
      })) as boolean;
      return isValid;
    } catch (e) {
      console.warn('verifyLeafInclusion on-chain check error:', e);
      return false;
    }
  };

  const dismissActiveTx = () => {
    setActiveTx(null);
  };

  const isCorrectNetwork = chainId === DEFAULT_CHAIN_ID;

  return (
    <WalletContext.Provider
      value={{
        address: effectiveAddress,
        chainId,
        isConnected: !!effectiveAddress,
        isCorrectNetwork,
        isConnecting,
        walletInstalled,
        error,
        utilityIdentity,
        capabilities,
        simulationMode,
        setSimulationMode,
        simulationRole,
        setSimulationRole,
        switchDemoRole,
        ethBalance,
        tokenBalance,
        escrowBalances,
        roles,
        connectMetaMask,
        disconnect,
        switchNetwork,
        refreshBalances,
        requestNativeEthFaucet,
        signEnergyOrder,
        executeTransaction,
        executeContractTx,
        mintTestTokens,
        depositEscrow,
        withdrawEscrow,
        commitEpochOnChain,
        commitClearingOnChain,
        cancelOrderOnChain,
        executeSettlementBatchOnChain,
        claimCertificateOnChain,
        transferCertificateOnChain,
        retireCertificateOnChain,
        verifyLeafOnChain,
        activeTx,
        txHistory,
        onChainActivity,
        dismissActiveTx,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = (): WalletContextType => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
