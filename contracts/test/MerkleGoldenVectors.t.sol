// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract MerkleGoldenVectorsTest is Test {
    function test_MerkleGoldenVector_4Leaves() public pure {
        bytes32 root = 0x0c48ddc2b8d6d066c52fc608d4d0254f418bea6cd8424fe95390ac87323f9c9f;

        bytes32[4] memory leaves = [
            bytes32(uint256(1)),
            bytes32(uint256(2)),
            bytes32(uint256(3)),
            bytes32(uint256(4))
        ];

        bytes32[] memory proof0 = new bytes32[](2);
        proof0[0] = 0x0000000000000000000000000000000000000000000000000000000000000002;
        proof0[1] = 0x2e174c10e159ea99b867ce3205125c24a42d128804e4070ed6fcc8cc98166aa0;
        assertTrue(MerkleProof.verify(proof0, root, leaves[0]));

        bytes32[] memory proof1 = new bytes32[](2);
        proof1[0] = 0x0000000000000000000000000000000000000000000000000000000000000001;
        proof1[1] = 0x2e174c10e159ea99b867ce3205125c24a42d128804e4070ed6fcc8cc98166aa0;
        assertTrue(MerkleProof.verify(proof1, root, leaves[1]));

        bytes32[] memory proof2 = new bytes32[](2);
        proof2[0] = 0x0000000000000000000000000000000000000000000000000000000000000004;
        proof2[1] = 0xe90b7bceb6e7df5418fb78d8ee546e97c83a08bbccc01a0644d599ccd2a7c2e0;
        assertTrue(MerkleProof.verify(proof2, root, leaves[2]));

        bytes32[] memory proof3 = new bytes32[](2);
        proof3[0] = 0x0000000000000000000000000000000000000000000000000000000000000003;
        proof3[1] = 0xe90b7bceb6e7df5418fb78d8ee546e97c83a08bbccc01a0644d599ccd2a7c2e0;
        assertTrue(MerkleProof.verify(proof3, root, leaves[3]));
    }

    function test_MerkleGoldenVector_5Leaves() public pure {
        bytes32 root = 0x3856185f708a95a4cef51f6538ed3ea849702a46e020430070ac99c94a831c58;

        bytes32[5] memory leaves = [
            bytes32(uint256(1)),
            bytes32(uint256(2)),
            bytes32(uint256(3)),
            bytes32(uint256(4)),
            bytes32(uint256(5))
        ];

        bytes32[] memory proof0 = new bytes32[](3);
        proof0[0] = 0x0000000000000000000000000000000000000000000000000000000000000002;
        proof0[1] = 0x2e174c10e159ea99b867ce3205125c24a42d128804e4070ed6fcc8cc98166aa0;
        proof0[2] = 0x0000000000000000000000000000000000000000000000000000000000000005;
        assertTrue(MerkleProof.verify(proof0, root, leaves[0]));

        bytes32[] memory proof4 = new bytes32[](1);
        proof4[0] = 0x0c48ddc2b8d6d066c52fc608d4d0254f418bea6cd8424fe95390ac87323f9c9f;
        assertTrue(MerkleProof.verify(proof4, root, leaves[4]));
    }
}
