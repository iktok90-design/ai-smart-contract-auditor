// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Inflatable4626 — DEMO ONLY. DO NOT DEPLOY.
/// @notice Naive ERC-4626 with the classic inflation/donation attack.
///         Used by Rugproof's `/demo inflation`.

interface IERC20 {
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

contract Inflatable4626 {
    IERC20 public immutable asset;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    constructor(IERC20 _a) {
        asset = _a;
    }

    function totalAssets() public view returns (uint256) {
        return asset.balanceOf(address(this)); // ← INFL-002 raw balance, donatable
    }

    /// INFL-001 — Naive share math. First depositor + donation can dilute next depositor to zero shares.
    /// No virtual shares, no dead-shares, no minimum first-deposit guard.
    function deposit(uint256 assets) external returns (uint256 shares) {
        if (totalSupply == 0) {
            shares = assets;
        } else {
            shares = assets * totalSupply / totalAssets(); // ← rounds DOWN; victim can get 0 shares
        }
        require(shares > 0, "zero shares"); // ← only revert; no min check on `assets`
        require(asset.transferFrom(msg.sender, address(this), assets), "xfer");
        totalSupply += shares;
        balanceOf[msg.sender] += shares;
    }

    function withdraw(uint256 shares) external returns (uint256 assets) {
        assets = shares * totalAssets() / totalSupply; // ← INFL-003 round direction reversed (favors withdrawer)
        balanceOf[msg.sender] -= shares;
        totalSupply -= shares;
        require(asset.transfer(msg.sender, assets), "xfer");
    }
}
