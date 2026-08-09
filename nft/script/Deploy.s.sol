// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Script.sol";
import {AuditCertificate} from "../src/AuditCertificate.sol";

/// @notice Deploy script for AuditCertificate.
/// Usage:
///   forge script nft/script/Deploy.s.sol:Deploy \
///     --rpc-url $BERA_RPC_URL --broadcast --verify
contract Deploy is Script {
    function run() external returns (AuditCertificate cert) {
        address admin = vm.envAddress("RUGPROOF_ADMIN");
        address issuer = vm.envAddress("RUGPROOF_ISSUER");
        string memory baseURI = vm.envOr("RUGPROOF_BASE_URI", string("ipfs://"));

        vm.startBroadcast();
        cert = new AuditCertificate(admin, issuer, baseURI);
        vm.stopBroadcast();

        console2.log("AuditCertificate deployed at:", address(cert));
        console2.log("Admin:", admin);
        console2.log("Issuer:", issuer);
    }
}
