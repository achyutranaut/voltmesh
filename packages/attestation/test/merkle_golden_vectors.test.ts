import { describe, it, expect } from 'vitest';
import { BinaryMerkleTree } from '../src/merkle';
import vectors from './fixtures/merkle_golden_vectors.json';

describe('Merkle Golden Vectors (Cross-Language OZ Compatibility)', () => {
  it('verifies 4-leaf tree matching golden vector root and proofs', () => {
    const { leaves, root, proofs } = vectors.tree4;
    const tree = new BinaryMerkleTree(leaves as `0x${string}`[]);
    expect(tree.getRoot().toLowerCase()).toBe(root.toLowerCase());

    leaves.forEach((leaf, idx) => {
      const generatedProof = tree.getProof(idx);
      expect(generatedProof.map((p) => p.toLowerCase())).toEqual(proofs[idx].map((p: string) => p.toLowerCase()));
      expect(BinaryMerkleTree.verify(generatedProof, root as `0x${string}`, leaf as `0x${string}`)).toBe(true);
    });
  });

  it('verifies 5-leaf tree matching golden vector root and proofs', () => {
    const { leaves, root, proofs } = vectors.tree5;
    const tree = new BinaryMerkleTree(leaves as `0x${string}`[]);
    expect(tree.getRoot().toLowerCase()).toBe(root.toLowerCase());

    leaves.forEach((leaf, idx) => {
      const generatedProof = tree.getProof(idx);
      expect(generatedProof.map((p) => p.toLowerCase())).toEqual(proofs[idx].map((p: string) => p.toLowerCase()));
      expect(BinaryMerkleTree.verify(generatedProof, root as `0x${string}`, leaf as `0x${string}`)).toBe(true);
    });
  });
});
