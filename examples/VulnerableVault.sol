// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title VulnerableVault — DEMO ONLY. DO NOT DEPLOY.
/// @notice Intentionally vulnerable. Used by Rugproof's `/demo reentrancy` to showcase
///         what `/audit` finds on a real contract. Has classic reentrancy, missing
///         access control on a privileged op, and an unchecked external call.
contract VulnerableVault {
    mapping(address => uint256) public balance;
    address public owner;
    bool public paused;

    constructor() {
        owner = msg.sender;
    }

    function deposit() external payable {
        balance[msg.sender] += msg.value;
    }

    /// REENT-001 — Classic reentrancy. State update AFTER external call.
    function withdraw() external {
        uint256 amt = balance[msg.sender];
        require(amt > 0, "no balance");

        (bool ok,) = msg.sender.call{value: amt}("");
        require(ok, "send failed");

        balance[msg.sender] = 0; // ← effects after interaction → CEI violated
    }

    /// ACCESS-001 — Missing onlyOwner; anyone can pause/unpause.
    function setPaused(bool p) external {
        paused = p;
    }

    /// ACCESS-002 — Sweep authority that can drain user deposits, no allowlist.
    function rescue(address payable to) external {
        require(msg.sender == owner, "not owner");
        to.transfer(address(this).balance);
    }

    /// UNCHK-001 — Low-level call return ignored. Notify hook can silently fail.
    function notifyDepositor(address depositor, bytes calldata data) external {
        depositor.call(data); // ← return value not checked
    }

    /// CENT-001 — Owner can immediately rotate to any address with no two-step / timelock.
    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "not owner");
        owner = newOwner; // ← no zero-address check; no two-step
    }
}
