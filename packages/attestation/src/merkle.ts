import { keccak256, encodePacked } from 'viem';

/**
 * Commutative pair hash compatible with OpenZeppelin MerkleProof.sol:
 * a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a))
 */
export function hashPair(a: `0x${string}`, b: `0x${string}`): `0x${string}` {
  const [first, second] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  return keccak256(encodePacked(['bytes32', 'bytes32'], [first, second]));
}

export class BinaryMerkleTree {
  private readonly leaves: `0x${string}`[];
  private readonly layers: `0x${string}`[][];

  constructor(leaves: `0x${string}`[]) {
    if (leaves.length === 0) {
      throw new Error('Cannot construct Merkle tree with 0 leaves');
    }
    this.leaves = [...leaves];
    this.layers = [this.leaves];
    this.buildTree();
  }

  private buildTree(): void {
    let currentLayer = this.layers[0];
    while (currentLayer.length > 1) {
      const nextLayer: `0x${string}`[] = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        if (i + 1 < currentLayer.length) {
          nextLayer.push(hashPair(currentLayer[i], currentLayer[i + 1]));
        } else {
          // Odd element is promoted to the next layer
          nextLayer.push(currentLayer[i]);
        }
      }
      this.layers.push(nextLayer);
      currentLayer = nextLayer;
    }
  }

  public getRoot(): `0x${string}` {
    const topLayer = this.layers[this.layers.length - 1];
    return topLayer[0];
  }

  public getProof(leafIndex: number): `0x${string}`[] {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error(`Leaf index ${leafIndex} out of bounds (0..${this.leaves.length - 1})`);
    }

    const proof: `0x${string}`[] = [];
    let currentIndex = leafIndex;

    for (let layerIndex = 0; layerIndex < this.layers.length - 1; layerIndex++) {
      const layer = this.layers[layerIndex];
      const isRightNode = currentIndex % 2 === 1;
      const pairIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

      if (pairIndex < layer.length) {
        proof.push(layer[pairIndex]);
      }
      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  }

  public static verify(proof: `0x${string}`[], root: `0x${string}`, leaf: `0x${string}`): boolean {
    let computedHash = leaf;
    for (const proofElement of proof) {
      computedHash = hashPair(computedHash, proofElement);
    }
    return computedHash.toLowerCase() === root.toLowerCase();
  }
}
