// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ReplayableBridge — DEMO ONLY. DO NOT DEPLOY.
/// @notice Demonstrates signature replay across chains and within a chain.
///         Used by Rugproof's `/demo replay`. Inspired by Wormhole / Nomad-era patterns.

interface IERC20 {
    function transfer(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

contract ReplayableBridge {
    IERC20 public immutable token;
    address public immutable relayer; // off-chain signer

    constructor(IERC20 _t, address _r) {
        token = _t;
        relayer = _r;
    }

    /// REPLAY-001 — No nonce, no chainId, no contract address — fully replayable.
    /// REPLAY-002 — Cross-chain replay: same signed payload accepted on any deployed chain.
    /// REPLAY-003 — `ecrecover` returns address(0) on bad sig; no `signer != address(0)` check.
    function withdraw(address recipient, uint256 amount, uint8 v, bytes32 r, bytes32 s) external {
        bytes32 hash = keccak256(abi.encode(recipient, amount)); // ← no nonce, no chainId, no addr(this)
        address signer = ecrecover(hash, v, r, s); // ← no zero-address check
        require(signer == relayer, "bad sig");

        require(token.transfer(recipient, amount), "xfer");
    }

    /// REPLAY-004 — `ecrecover` malleability not handled (no s-bound check).
    function approveSpend(address spender, uint256 amount, uint8 v, bytes32 r, bytes32 s) external {
        bytes32 hash = keccak256(abi.encode(spender, amount));
        address signer = ecrecover(hash, v, r, s);
        // ← `s` can be flipped to `n - s` and signature still valid; replay key changes
        require(signer == relayer, "bad sig");
        // ... approve logic
    }
}
