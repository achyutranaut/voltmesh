import {
  keccak256,
  encodePacked,
  recoverMessageAddress,
  Address,
  Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { MeterReadingPayload, EpochRecord } from '@energy-dex/types';
import { EpochBuilder } from '@energy-dex/epoch-builder';

export interface OracleNodeConfig {
  operatorId: string;
  privateKey: Hex;
  oracleContractAddress: Address;
  chainId: number;
}

export interface OracleSignature {
  operatorId: string;
  signerAddress: Address;
  signature: Hex;
}

/**
 * Computes canonical epoch message hash matching EpochOracle.sol
 */
export function computeEpochMessageHash(
  chainId: number,
  oracleContractAddress: Address,
  zoneId: number,
  intervalIdx: number,
  merkleRoot: Hex,
  leafCount: number,
  totalWh: bigint
): Hex {
  return keccak256(
    encodePacked(
      ['uint256', 'address', 'uint32', 'uint32', 'bytes32', 'uint32', 'uint64'],
      [
        BigInt(chainId),
        oracleContractAddress,
        zoneId,
        intervalIdx,
        merkleRoot,
        leafCount,
        totalWh,
      ]
    )
  );
}

export class OracleNode {
  public readonly operatorId: string;
  public readonly oracleContractAddress: Address;
  public readonly chainId: number;
  private readonly account: ReturnType<typeof privateKeyToAccount>;

  constructor(config: OracleNodeConfig) {
    this.operatorId = config.operatorId;
    this.oracleContractAddress = config.oracleContractAddress;
    this.chainId = config.chainId;
    this.account = privateKeyToAccount(config.privateKey);
  }

  public getSignerAddress(): Address {
    return this.account.address;
  }

  /**
   * Independently validates readings, rebuilds epoch Merkle tree, and produces signed attestation.
   */
  public async validateAndSignEpoch(
    zoneId: number,
    intervalIdx: number,
    readings: MeterReadingPayload[]
  ): Promise<{ epoch: EpochRecord; signature: OracleSignature }> {
    // 0. Physical plausibility & consistency verification
    for (const r of readings) {
      if (r.zoneId !== zoneId || r.intervalIdx !== intervalIdx) {
        throw new Error(
          `Oracle [${this.operatorId}] rejected reading for ${r.deviceId}: mismatched zone/interval (${r.zoneId}:${r.intervalIdx} vs ${zoneId}:${intervalIdx})`
        );
      }
      if (r.energyWh < 0n) {
        throw new Error(`Oracle [${this.operatorId}] rejected reading for ${r.deviceId}: negative energy volume`);
      }
      if (r.counter <= 0n) {
        throw new Error(`Oracle [${this.operatorId}] rejected reading for ${r.deviceId}: non-positive counter`);
      }
    }

    // 1. Re-compute Merkle tree independently
    const builtEpoch = EpochBuilder.buildEpoch(zoneId, intervalIdx, readings);

    // 2. Compute canonical message hash
    const messageHash = computeEpochMessageHash(
      this.chainId,
      this.oracleContractAddress,
      zoneId,
      intervalIdx,
      builtEpoch.merkleRoot,
      builtEpoch.leafCount,
      builtEpoch.totalWh
    );

    // 3. Sign as an Ethereum Signed Message
    const signature = await this.account.signMessage({
      message: { raw: messageHash },
    });

    return {
      epoch: builtEpoch.epochRecord,
      signature: {
        operatorId: this.operatorId,
        signerAddress: this.account.address,
        signature,
      },
    };
  }
}

export class QuorumAggregator {
  /**
   * Aggregates and sorts oracle signatures strictly ascending by signer address for contract submission.
   */
  public static async prepareSubmission(
    chainId: number,
    oracleContractAddress: Address,
    epoch: EpochRecord,
    signatures: OracleSignature[],
    quorumThreshold: number
  ): Promise<Hex[]> {
    if (signatures.length < quorumThreshold) {
      throw new Error(`Insufficient signatures: ${signatures.length} received, ${quorumThreshold} required`);
    }

    const messageHash = computeEpochMessageHash(
      chainId,
      oracleContractAddress,
      epoch.zoneId,
      epoch.intervalIdx,
      epoch.merkleRoot as Hex,
      epoch.leafCount,
      epoch.totalWh
    );

    // Verify and map unique signers
    const verifiedSigners: { signer: Address; signature: Hex }[] = [];
    const seenSigners = new Set<string>();

    for (const sig of signatures) {
      const recovered = await recoverMessageAddress({
        message: { raw: messageHash },
        signature: sig.signature,
      });

      const normalized = recovered.toLowerCase();
      if (seenSigners.has(normalized)) {
        continue; // duplicate signature from same signer
      }
      seenSigners.add(normalized);
      verifiedSigners.push({ signer: recovered, signature: sig.signature });
    }

    if (verifiedSigners.length < quorumThreshold) {
      throw new Error(`Insufficient unique valid signers after recovery: ${verifiedSigners.length}`);
    }

    // Sort strictly ascending by address (as required by EpochOracle.sol)
    verifiedSigners.sort((a, b) => a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()));

    return verifiedSigners.slice(0, quorumThreshold).map((s) => s.signature);
  }
}

export interface OracleEquivocationReport {
  operatorId: string;
  signerAddress: Address;
  zoneId: number;
  intervalIdx: number;
  rootA: Hex;
  rootB: Hex;
  signatureA: Hex;
  signatureB: Hex;
  detectedAt: number;
}

export class OracleEquivocationDetector {
  private signedRoots = new Map<string, { root: Hex; signature: Hex; operatorId: string }>();
  private quarantinedOracles = new Set<string>();
  private equivocationReports: OracleEquivocationReport[] = [];

  /**
   * Checks whether a new signature conflicts with a previously registered root for the same interval.
   * If conflicting, the oracle is immediately quarantined to prevent quorum contamination.
   */
  public registerSignature(
    signerAddress: Address,
    operatorId: string,
    zoneId: number,
    intervalIdx: number,
    merkleRoot: Hex,
    signature: Hex
  ): { isEquivocation: boolean; report?: OracleEquivocationReport; isQuarantined: boolean } {
    const norm = signerAddress.toLowerCase();
    if (this.quarantinedOracles.has(norm)) {
      return { isEquivocation: true, isQuarantined: true };
    }

    const key = `${norm}:${zoneId}:${intervalIdx}`;
    const existing = this.signedRoots.get(key);

    if (existing) {
      if (existing.root.toLowerCase() !== merkleRoot.toLowerCase()) {
        this.quarantinedOracles.add(norm);
        const report: OracleEquivocationReport = {
          operatorId,
          signerAddress,
          zoneId,
          intervalIdx,
          rootA: existing.root,
          rootB: merkleRoot,
          signatureA: existing.signature,
          signatureB: signature,
          detectedAt: Math.floor(Date.now() / 1000),
        };
        this.equivocationReports.push(report);
        return { isEquivocation: true, report, isQuarantined: true };
      }
      return { isEquivocation: false, isQuarantined: false };
    }

    this.signedRoots.set(key, { root: merkleRoot, signature, operatorId });
    return { isEquivocation: false, isQuarantined: false };
  }

  public isOracleQuarantined(signerAddress: Address): boolean {
    return this.quarantinedOracles.has(signerAddress.toLowerCase());
  }

  public getQuarantinedCount(): number {
    return this.quarantinedOracles.size;
  }

  public getReports(): OracleEquivocationReport[] {
    return [...this.equivocationReports];
  }
}
