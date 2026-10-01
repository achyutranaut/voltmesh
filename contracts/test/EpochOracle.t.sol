// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "../src/AccessRegistry.sol";
import "../src/EpochOracle.sol";

contract EpochOracleTest is Test {
    using MessageHashUtils for bytes32;

    AccessRegistry public access;
    EpochOracle public oracle;

    address public admin = address(0xAD);

    uint256[3] public oracleKeys = [0x101, 0x102, 0x103];
    address[3] public oracleAddrs;

    function setUp() public {
        for (uint256 i = 0; i < 3; i++) {
            oracleAddrs[i] = vm.addr(oracleKeys[i]);
        }

        // Sort oracleAddrs strictly ascending to satisfy sorted signers rule
        for (uint256 i = 0; i < 3; i++) {
            for (uint256 j = i + 1; j < 3; j++) {
                if (oracleAddrs[i] > oracleAddrs[j]) {
                    address tempA = oracleAddrs[i];
                    oracleAddrs[i] = oracleAddrs[j];
                    oracleAddrs[j] = tempA;

                    uint256 tempK = oracleKeys[i];
                    oracleKeys[i] = oracleKeys[j];
                    oracleKeys[j] = tempK;
                }
            }
        }

        vm.startPrank(admin);
        access = new AccessRegistry(admin);

        for (uint256 i = 0; i < 3; i++) {
            access.grantRole(access.ORACLE_ROLE(), oracleAddrs[i]);
        }

        oracle = new EpochOracle(address(access), 3); // 3-of-3 threshold
        vm.stopPrank();
    }

    function test_EpochOracle_SubmitAndFinalizeEpoch() public {
        uint32 zoneId = 1;
        uint32 intervalIdx = 100;
        bytes32 root = keccak256("merkle-root-epoch-100");
        uint32 leafCount = 50;
        uint64 totalWh = 125000;

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                block.chainid,
                address(oracle),
                zoneId,
                intervalIdx,
                root,
                leafCount,
                totalWh
            )
        ).toEthSignedMessageHash();

        bytes[] memory signatures = new bytes[](3);
        for (uint256 i = 0; i < 3; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(oracleKeys[i], messageHash);
            signatures[i] = abi.encodePacked(r, s, v);
        }

        oracle.submitEpoch(zoneId, intervalIdx, root, leafCount, totalWh, signatures);

        EpochOracle.EpochRecord memory rec = oracle.getEpoch(zoneId, intervalIdx);
        assertEq(rec.merkleRoot, root);
        assertEq(rec.totalWh, totalWh);
        assertGt(rec.finalizedAt, 0);
    }

    function test_EpochOracle_RevertOnInsufficientSignatures() public {
        uint32 zoneId = 1;
        uint32 intervalIdx = 100;
        bytes32 root = keccak256("merkle-root-epoch-100");

        bytes[] memory signatures = new bytes[](2); // only 2, threshold is 3
        vm.expectRevert();
        oracle.submitEpoch(zoneId, intervalIdx, root, 10, 5000, signatures);
    }

    function test_EpochOracle_RevertOnUnauthorizedSigner() public {
        uint32 zoneId = 1;
        uint32 intervalIdx = 100;
        bytes32 root = keccak256("merkle-root-epoch-100");

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                block.chainid,
                address(oracle),
                zoneId,
                intervalIdx,
                root,
                uint32(10),
                uint64(5000)
            )
        ).toEthSignedMessageHash();

        uint256 rogueKey = 0x9999;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(rogueKey, messageHash);

        bytes[] memory signatures = new bytes[](3);
        signatures[0] = abi.encodePacked(r, s, v); // unauthorized
        // fill other two
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(oracleKeys[1], messageHash);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(oracleKeys[2], messageHash);
        signatures[1] = abi.encodePacked(r1, s1, v1);
        signatures[2] = abi.encodePacked(r2, s2, v2);

        vm.expectRevert();
        oracle.submitEpoch(zoneId, intervalIdx, root, 10, 5000, signatures);
    }
}
