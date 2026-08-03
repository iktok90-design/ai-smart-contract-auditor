// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import {AuditCertificate} from "../src/AuditCertificate.sol";

contract AuditCertificateTest is Test {
    AuditCertificate cert;
    address admin = makeAddr("admin");
    uint256 issuerKey = 0xA11CE;
    address issuer = vm.addr(issuerKey);
    address subject = makeAddr("subject");

    function setUp() public {
        cert = new AuditCertificate(admin, issuer, "ipfs://");
    }

    function test_IssueWithValidSig() public {
        bytes32 reportHash = keccak256("dummy report");
        string memory cid = "QmExampleCidAbc123";
        string memory name = "VulnerableVault";
        uint8 grade = 5; // E

        bytes32 digest = keccak256(abi.encode(block.chainid, address(cert), subject, reportHash, cid, name, grade));
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(issuerKey, ethDigest);

        uint256 id = cert.issue(subject, reportHash, cid, name, grade, abi.encodePacked(r, s, v));
        assertEq(id, 1);
        assertEq(cert.ownerOf(id), subject);
        assertEq(cert.tokenURI(id), string.concat("ipfs://", cid));
    }

    function test_RejectsBadSig() public {
        bytes32 reportHash = keccak256("dummy");
        bytes memory badSig = new bytes(65);
        vm.expectRevert(AuditCertificate.InvalidIssuerSig.selector);
        cert.issue(subject, reportHash, "QmX", "X", 0, badSig);
    }

    function test_Soulbound_BlocksTransfer() public {
        bytes32 digest = keccak256(abi.encode(block.chainid, address(cert), subject, bytes32("h"), "Q", "X", uint8(0)));
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(issuerKey, ethDigest);
        cert.issue(subject, bytes32("h"), "Q", "X", 0, abi.encodePacked(r, s, v));

        vm.prank(subject);
        vm.expectRevert(AuditCertificate.SoulboundNonTransferable.selector);
        cert.transferFrom(subject, address(this), 1);
    }
}
