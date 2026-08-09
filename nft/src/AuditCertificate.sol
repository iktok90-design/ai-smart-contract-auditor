// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title Rugproof Audit Certificate
/// @notice Soulbound ERC-721 issued for completed Rugproof audits.
///         Each token's metadata points to an IPFS-pinned audit report + PNG card.
///         Designed for Berachain. The certificate is issued by the Rugproof signer
///         (a multi-sig). Subjects (audit targets) cannot transfer their certs.
contract AuditCertificate is ERC721, Ownable2Step {
    using Strings for uint256;

    struct Cert {
        address subject;        // contract or repo owner
        bytes32 reportHash;     // sha256 of the canonical audit report JSON
        string ipfsCid;         // ipfs:// or ipfs CID for the report bundle
        string targetName;      // e.g. "VulnerableVault" or "MyProtocol/0xabc.."
        uint64  issuedAt;
        uint8   grade;          // 0=A+, 1=A, 2=B, 3=C, 4=D, 5=E, 6=F
    }

    mapping(uint256 => Cert) public certs;
    uint256 public nextId;
    string  public baseURI;
    address public issuer;       // off-chain signer who countersigns mints (the Rugproof bot)

    event CertIssued(uint256 indexed id, address indexed subject, bytes32 reportHash, string ipfsCid, uint8 grade);
    event IssuerUpdated(address oldIssuer, address newIssuer);
    event BaseURIUpdated(string newBaseURI);

    error SoulboundNonTransferable();
    error InvalidGrade();
    error InvalidIssuerSig();

    constructor(address admin, address _issuer, string memory _baseURI)
        ERC721("Rugproof Audit Certificate", "RUGPROOF")
        Ownable(admin)
    {
        issuer = _issuer;
        baseURI = _baseURI;
        emit IssuerUpdated(address(0), _issuer);
        emit BaseURIUpdated(_baseURI);
    }

    /// @notice Issue a certificate. Requires `issuer` signature over the report hash.
    /// @param subject The contract owner / repo maintainer the cert is awarded to.
    /// @param reportHash sha256 of the canonical audit report JSON.
    /// @param ipfsCid IPFS CID where the report bundle (JSON + MD + PNG) lives.
    /// @param targetName Human-readable target name.
    /// @param grade 0=A+ ... 6=F.
    /// @param issuerSig 65-byte ECDSA sig from `issuer` over keccak256(abi.encode(...)).
    function issue(
        address subject,
        bytes32 reportHash,
        string calldata ipfsCid,
        string calldata targetName,
        uint8 grade,
        bytes calldata issuerSig
    ) external returns (uint256 id) {
        if (grade > 6) revert InvalidGrade();
        bytes32 digest = keccak256(abi.encode(block.chainid, address(this), subject, reportHash, ipfsCid, targetName, grade));
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        if (recover(ethDigest, issuerSig) != issuer) revert InvalidIssuerSig();

        id = ++nextId;
        certs[id] = Cert({
            subject: subject,
            reportHash: reportHash,
            ipfsCid: ipfsCid,
            targetName: targetName,
            issuedAt: uint64(block.timestamp),
            grade: grade
        });
        _safeMint(subject, id);
        emit CertIssued(id, subject, reportHash, ipfsCid, grade);
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        return string.concat(baseURI, certs[id].ipfsCid);
    }

    function setBaseURI(string calldata b) external onlyOwner {
        baseURI = b;
        emit BaseURIUpdated(b);
    }

    function setIssuer(address newIssuer) external onlyOwner {
        emit IssuerUpdated(issuer, newIssuer);
        issuer = newIssuer;
    }

    /// @dev Soulbound — block transfers (allow only mint and burn-to-zero).
    function _update(address to, uint256 id, address auth) internal override returns (address from) {
        from = _ownerOf(id);
        if (from != address(0) && to != address(0)) revert SoulboundNonTransferable();
        return super._update(to, id, auth);
    }

    function recover(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return address(0); // s-malleability guard
        }
        return ecrecover(hash, v, r, s);
    }
}
