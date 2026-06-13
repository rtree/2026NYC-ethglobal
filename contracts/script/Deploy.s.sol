// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {ExecutionDelegate7702} from "../src/ExecutionDelegate7702.sol";
import {AgentNFT} from "../src/AgentNFT.sol";

/// @notice Deploys the ExecutionDelegate7702 implementation (the EIP-7702 delegate target) and AgentNFT.
/// @dev    `forge script script/Deploy.s.sol --rpc-url base --broadcast`. Deployer key via env/cast.
contract Deploy is Script {
    function run() external returns (address delegateImpl, address agentNft) {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        vm.startBroadcast(pk);
        ExecutionDelegate7702 del = new ExecutionDelegate7702();
        AgentNFT nft = new AgentNFT();
        vm.stopBroadcast();
        delegateImpl = address(del);
        agentNft = address(nft);
        console2.log("ExecutionDelegate7702 impl:", delegateImpl);
        console2.log("AgentNFT:", agentNft);
    }
}
