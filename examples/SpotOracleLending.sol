// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title SpotOracleLending — DEMO ONLY. DO NOT DEPLOY.
/// @notice Intentionally vulnerable lending market. Demonstrates classic
///         flash-loan + oracle manipulation patterns for Rugproof's `/demo oracle`.

interface IPair {
    function getReserves() external view returns (uint112, uint112, uint32);
    function token0() external view returns (address);
    function token1() external view returns (address);
}

interface IERC20 {
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

contract SpotOracleLending {
    IPair public immutable pair; // collateral / debt AMM pair
    IERC20 public immutable collateral;
    IERC20 public immutable debt;

    mapping(address => uint256) public collateralOf;
    mapping(address => uint256) public debtOf;

    uint256 public constant MIN_HEALTH = 1.5e18; // 150% collateralization

    constructor(IPair _pair) {
        pair = _pair;
        collateral = IERC20(_pair.token0());
        debt = IERC20(_pair.token1());
    }

    /// ORACLE-001 — Spot-price read from AMM. Flash-loan-manipulable in a single block.
    function _spotPrice() internal view returns (uint256) {
        (uint112 r0, uint112 r1,) = pair.getReserves();
        return uint256(r1) * 1e18 / uint256(r0); // debt-per-collateral
    }

    function deposit(uint256 amt) external {
        require(collateral.transferFrom(msg.sender, address(this), amt), "xfer");
        collateralOf[msg.sender] += amt;
    }

    /// ORACLE-002 — Borrow uses spot price for collateral valuation. Sandwichable.
    function borrow(uint256 amt) external {
        uint256 collValue = collateralOf[msg.sender] * _spotPrice() / 1e18;
        debtOf[msg.sender] += amt;
        require(collValue * 1e18 >= debtOf[msg.sender] * MIN_HEALTH, "unhealthy");
        require(debt.transfer(msg.sender, amt), "xfer");
    }

    function repay(uint256 amt) external {
        require(debt.transferFrom(msg.sender, address(this), amt), "xfer");
        debtOf[msg.sender] -= amt;
    }

    /// ORACLE-003 — Liquidation health check uses spot price → flash-loan crash → free liquidations.
    function liquidate(address victim) external {
        uint256 collValue = collateralOf[victim] * _spotPrice() / 1e18;
        require(collValue * 1e18 < debtOf[victim] * MIN_HEALTH, "healthy");

        uint256 seized = collateralOf[victim];
        collateralOf[victim] = 0;
        debtOf[victim] = 0;
        require(collateral.transfer(msg.sender, seized), "xfer");
    }
}
