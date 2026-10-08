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
    address public auditor = address(0xA0D1);

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
        access.grantRole(access.AUDITOR_ROLE(), auditor);

        // Advance timestamp so interval 100 has completed (100 * 900 = 90,000s)
        vm.warp(100 * 900 + 10);

        oracle = new EpochOracle(address(access), 3); // 3-of-3 threshold
        vm.stopPrank();
    }

    // 1. Constructor quorum 0 reverts
    function test_Constructor_QuorumZeroReverts() public {
        vm.startPrank(admin);
        vm.expectRevert(EpochOracle.InvalidQuorumThreshold.selector);
        new EpochOracle(address(access), 0);
        vm.stopPrank();
    }

    // 2. Setter quorum 0 reverts
    function test_Setter_QuorumZeroReverts() public {
        vm.startPrank(admin);
        vm.expectRevert(EpochOracle.InvalidQuorumThreshold.selector);
        oracle.setQuorumThreshold(0);
        vm.stopPrank();
    }

    // 3. Quorum greater than oracle set rejected
    function test_Quorum_GreaterThanOracleSetRejected() public {
        vm.startPrank(admin);
        // Current oracle count is 3, requesting 4 should revert
        vm.expectRevert(abi.encodeWithSelector(EpochOracle.QuorumExceedsOracleCount.selector, 4, 3));
        oracle.setQuorumThreshold(4);
        vm.stopPrank();
    }

    // 4. Future epoch rejected
    function test_FutureEpoch_Rejected() public {
        uint32 current = oracle.currentInterval();
        uint32 futureInterval = current + 1;
        bytes32 root = keccak256("merkle-root-future");

        bytes[] memory signatures = new bytes[](3);
        vm.expectRevert(abi.encodeWithSelector(EpochOracle.FutureEpochNotAllowed.selector, futureInterval, current));
        oracle.submitEpoch(1, futureInterval, root, 10, 5000, signatures);
    }

    // 5. Valid quorum succeeds
    function test_ValidQuorum_Succeeds() public {
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
        assertEq(uint256(rec.status), uint256(EpochOracle.EpochStatus.FINALIZED));
    }

    // 6. Insufficient signatures rejected
    function test_InsufficientSignatures_Rejected() public {
        uint32 zoneId = 1;
        uint32 intervalIdx = 100;
        bytes32 root = keccak256("merkle-root-epoch-100");

        bytes[] memory signatures = new bytes[](2); // only 2, threshold is 3
        vm.expectRevert(abi.encodeWithSelector(EpochOracle.InsufficientSignatures.selector, 2, 3));
        oracle.submitEpoch(zoneId, intervalIdx, root, 10, 5000, signatures);
    }

    // 7. Duplicate signer rejected
    function test_DuplicateSigner_Rejected() public {
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

        (uint8 v0, bytes32 r0, bytes32 s0) = vm.sign(oracleKeys[0], messageHash);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(oracleKeys[1], messageHash);

        bytes[] memory signatures = new bytes[](3);
        signatures[0] = abi.encodePacked(r0, s0, v0);
        signatures[1] = abi.encodePacked(r1, s1, v1);
        signatures[2] = abi.encodePacked(r1, s1, v1); // duplicate signer 1

        vm.expectRevert(abi.encodeWithSelector(EpochOracle.DuplicateOrUnsortedSigner.selector, oracleAddrs[1]));
        oracle.submitEpoch(zoneId, intervalIdx, root, 10, 5000, signatures);
    }

    // 8. Unauthorized signer rejected
    function test_UnauthorizedSigner_Rejected() public {
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
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(oracleKeys[1], messageHash);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(oracleKeys[2], messageHash);
        signatures[1] = abi.encodePacked(r1, s1, v1);
        signatures[2] = abi.encodePacked(r2, s2, v2);

        vm.expectRevert();
        oracle.submitEpoch(zoneId, intervalIdx, root, 10, 5000, signatures);
    }

    // 9. Challenge lifecycle: Auditor challenges and admin resolves valid
    function test_ChallengeLifecycle_ValidResolution() public {
        test_ValidQuorum_Succeeds();

        vm.prank(auditor);
        oracle.challengeEpoch(1, 100, "Suspected anomaly in interval meter reading");

        EpochOracle.EpochRecord memory challengedRec = oracle.getEpoch(1, 100);
        assertEq(uint256(challengedRec.status), uint256(EpochOracle.EpochStatus.CHALLENGED));

        // Admin resolves valid
        vm.prank(admin);
        oracle.resolveChallenge(1, 100, true, "Auditor verification confirmed readings valid");

        EpochOracle.EpochRecord memory resolvedRec = oracle.getEpoch(1, 100);
        assertEq(uint256(resolvedRec.status), uint256(EpochOracle.EpochStatus.RESOLVED_VALID));
    }

    // 10. Challenge lifecycle: Admin resolves invalid
    function test_ChallengeLifecycle_InvalidResolution() public {
        test_ValidQuorum_Succeeds();

        vm.prank(auditor);
        oracle.challengeEpoch(1, 100, "Proved Byzantine fault in telemetry");

        vm.prank(admin);
        oracle.resolveChallenge(1, 100, false, "Epoch invalidated by consensus council");

        EpochOracle.EpochRecord memory rec = oracle.getEpoch(1, 100);
        assertEq(uint256(rec.status), uint256(EpochOracle.EpochStatus.RESOLVED_INVALID));

        // Leaf inclusion must return false for invalidated epoch
        bytes32[] memory proof = new bytes32[](0);
        bool verified = oracle.verifyLeafInclusion(1, 100, keccak256("leaf"), proof);
        assertFalse(verified);
    }

    // 11. submitEpoch reverts on zero root or zero leaf count
    function test_SubmitEpoch_ZeroRootOrZeroLeafCount_Reverts() public {
        uint32 zoneId = 1;
        uint32 intervalIdx = 100;
        bytes[] memory signatures = new bytes[](3);

        // Zero root
        bytes32 messageHash = keccak256(
            abi.encodePacked(block.chainid, address(oracle), zoneId, intervalIdx, bytes32(0), uint32(10), uint64(5000))
        ).toEthSignedMessageHash();
        for (uint256 i = 0; i < 3; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(oracleKeys[i], messageHash);
            signatures[i] = abi.encodePacked(r, s, v);
        }
        vm.expectRevert(EpochOracle.ZeroRoot.selector);
        oracle.submitEpoch(zoneId, intervalIdx, bytes32(0), 10, 5000, signatures);

        // Zero leafCount
        bytes32 validRoot = keccak256("valid_root");
        messageHash = keccak256(
            abi.encodePacked(block.chainid, address(oracle), zoneId, intervalIdx, validRoot, uint32(0), uint64(5000))
        ).toEthSignedMessageHash();
        for (uint256 i = 0; i < 3; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(oracleKeys[i], messageHash);
            signatures[i] = abi.encodePacked(r, s, v);
        }
        vm.expectRevert(EpochOracle.ZeroLeafCount.selector);
        oracle.submitEpoch(zoneId, intervalIdx, validRoot, 0, 5000, signatures);
    }

    // 12. challengeEpoch reverts after challenge window has closed (finalizedAt + 30 days)
    function test_ChallengeEpoch_WindowClosed_Reverts() public {
        test_ValidQuorum_Succeeds();

        // Warp past finalizedAt + 30 days
        vm.warp(block.timestamp + 30 days + 1);

        vm.prank(auditor);
        vm.expectRevert(EpochOracle.ChallengeWindowClosed.selector);
        oracle.challengeEpoch(1, 100, "Too late challenge");
    }

    // 13. Resubmission succeeds if epoch was RESOLVED_INVALID
    function test_ResubmitEpoch_AfterResolvedInvalid_Succeeds() public {
        test_ChallengeLifecycle_InvalidResolution();

        uint32 zoneId = 1;
        uint32 intervalIdx = 100;
        bytes32 newRoot = keccak256("corrected_merkle_root");
        uint32 newLeafCount = 12;
        uint64 newTotalWh = 6000;

        bytes32 messageHash = keccak256(
            abi.encodePacked(block.chainid, address(oracle), zoneId, intervalIdx, newRoot, newLeafCount, newTotalWh)
        ).toEthSignedMessageHash();

        bytes[] memory signatures = new bytes[](3);
        for (uint256 i = 0; i < 3; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(oracleKeys[i], messageHash);
            signatures[i] = abi.encodePacked(r, s, v);
        }

        // Resubmission should now succeed
        oracle.submitEpoch(zoneId, intervalIdx, newRoot, newLeafCount, newTotalWh, signatures);

        EpochOracle.EpochRecord memory rec = oracle.getEpoch(zoneId, intervalIdx);
        assertEq(rec.merkleRoot, newRoot);
        assertEq(rec.leafCount, newLeafCount);
        assertEq(uint256(rec.status), uint256(EpochOracle.EpochStatus.FINALIZED));
    }
}
