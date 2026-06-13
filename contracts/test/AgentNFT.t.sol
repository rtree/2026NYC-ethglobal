// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AgentNFT} from "../src/AgentNFT.sol";

contract AgentNFTTest is Test {
    AgentNFT internal nft;
    address internal owner;
    address internal user = address(0xBEEF);

    function setUp() public {
        owner = address(this);
        nft = new AgentNFT();
    }

    function test_mintExecutor() public {
        AgentNFT.AgentBase memory b =
            AgentNFT.AgentBase({role: AgentNFT.Role.EXECUTOR, agentManifestHash: keccak256("pkg"), runtimeManifestHash: keccak256("rt")});
        AgentNFT.ExecutorExt memory e = AgentNFT.ExecutorExt({
            fundOwner: user,
            intentId: keccak256("intent-abc"),
            executionContract: address(0xABCD),
            hardGuardrailsHash: keccak256("hg")
        });
        uint256 id = nft.mintExecutor(user, b, e);
        assertEq(id, 1);
        assertEq(nft.ownerOf(id), user);
        (AgentNFT.Role role,,) = nft.baseOf(id);
        assertEq(uint8(role), uint8(AgentNFT.Role.EXECUTOR));
    }

    function test_mintWatcher_andTokenURI() public {
        AgentNFT.AgentBase memory b =
            AgentNFT.AgentBase({role: AgentNFT.Role.WATCHER, agentManifestHash: keccak256("wpkg"), runtimeManifestHash: keccak256("wrt")});
        AgentNFT.WatcherExt memory w = AgentNFT.WatcherExt({
            watchedExecutorTokenId: 1,
            watchedIntentId: keccak256("intent-abc"),
            executorPackageHash: keccak256("pkg"),
            hardGuardrailsHash: keccak256("hg"),
            semanticGuardrailsHash: keccak256("sem"),
            watcherPackageHash: keccak256("wpkg"),
            quorumSetId: 1
        });
        uint256 id = nft.mintWatcher(user, b, w);
        nft.setTokenURI(id, "https://intentos.arkt.me/agent/2");
        assertEq(nft.tokenURI(id), "https://intentos.arkt.me/agent/2");
    }

    function test_onlyOwnerCanMint() public {
        AgentNFT.AgentBase memory b =
            AgentNFT.AgentBase({role: AgentNFT.Role.EXECUTOR, agentManifestHash: bytes32(0), runtimeManifestHash: bytes32(0)});
        AgentNFT.ExecutorExt memory e =
            AgentNFT.ExecutorExt({fundOwner: user, intentId: bytes32(0), executionContract: address(0), hardGuardrailsHash: bytes32(0)});
        vm.prank(user);
        vm.expectRevert();
        nft.mintExecutor(user, b, e);
    }
}
