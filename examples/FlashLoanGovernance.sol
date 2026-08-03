// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title FlashLoanGovernance — DEMO ONLY. DO NOT DEPLOY.
/// @notice Demonstrates flash-loan-vote vulnerability. Used by Rugproof's `/demo flash-loan`.
///         Inspired by Beanstalk (April 2022, $182M).

interface IGovToken {
    function balanceOf(address) external view returns (uint256);
}

contract FlashLoanGovernance {
    IGovToken public immutable govToken;

    struct Proposal {
        address target;
        bytes callData;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 deadline;
        bool executed;
    }

    Proposal[] public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    constructor(IGovToken _g) {
        govToken = _g;
    }

    function propose(address target, bytes calldata callData) external returns (uint256) {
        proposals.push(
            Proposal({
                target: target,
                callData: callData,
                forVotes: 0,
                againstVotes: 0,
                deadline: block.timestamp + 1, // ← FLASH-001 — no voting delay
                executed: false
            })
        );
        return proposals.length - 1;
    }

    /// FLASH-001 — Vote weight read from spot balance. Flash-borrow → vote → repay = total power.
    /// FLASH-002 — No voting delay; same block as proposal.
    function castVote(uint256 propId, bool support) external {
        require(block.timestamp <= proposals[propId].deadline, "expired");
        require(!hasVoted[propId][msg.sender], "voted");

        uint256 weight = govToken.balanceOf(msg.sender); // ← spot balance
        hasVoted[propId][msg.sender] = true;

        if (support) proposals[propId].forVotes += weight;
        else proposals[propId].againstVotes += weight;
    }

    /// GOV-001 — execute() callable immediately at deadline (no timelock between approval and execution).
    function execute(uint256 propId) external {
        Proposal storage p = proposals[propId];
        require(block.timestamp > p.deadline, "voting open");
        require(!p.executed, "executed");
        require(p.forVotes > p.againstVotes, "rejected");

        p.executed = true;
        (bool ok,) = p.target.call(p.callData); // ← UNCHK-002 ignored return value
        require(ok, "exec failed");
    }
}
