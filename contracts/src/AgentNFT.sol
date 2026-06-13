// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AgentNFT
/// @notice ERC721 + ERC-8004-compatible registration for Executor & Watcher agents (010 §6).
/// @dev    Transfer moves identity + Runtime usage right only; fund custody never moves (it stays in
///         the Owner EOA delegate). `(future)` fields from 010 §6 are intentionally omitted in MVP.
contract AgentNFT is ERC721, Ownable {
    enum Role {
        EXECUTOR,
        WATCHER
    }

    struct AgentBase {
        Role role;
        bytes32 agentManifestHash; // == Agent Package manifest.json packageHash
        bytes32 runtimeManifestHash;
    }

    struct ExecutorExt {
        address fundOwner; // address that holds the funds (custody does NOT move to the NFT)
        bytes32 intentId;
        address executionContract; // bound EIP-7702 ExecutionDelegate7702 (== Owner EOA)
        bytes32 hardGuardrailsHash;
    }

    struct WatcherExt {
        uint256 watchedExecutorTokenId;
        bytes32 watchedIntentId;
        bytes32 executorPackageHash;
        bytes32 hardGuardrailsHash;
        bytes32 semanticGuardrailsHash;
        bytes32 watcherPackageHash;
        uint256 quorumSetId;
    }

    uint256 public nextTokenId = 1;

    mapping(uint256 => AgentBase) public baseOf;
    mapping(uint256 => ExecutorExt) public executorOf;
    mapping(uint256 => WatcherExt) public watcherOf;
    mapping(uint256 => string) internal _tokenURI; // -> ERC-8004 registration JSON URI

    event ExecutorMinted(uint256 indexed tokenId, address indexed to, bytes32 intentId, bytes32 packageHash);
    event WatcherMinted(uint256 indexed tokenId, address indexed to, uint256 watchedExecutorTokenId);
    event TokenURISet(uint256 indexed tokenId, string uri);

    constructor() ERC721("IntentOS Agent", "IOSA") Ownable(msg.sender) {}

    function mintExecutor(address to, AgentBase calldata b, ExecutorExt calldata e)
        external
        onlyOwner
        returns (uint256 tokenId)
    {
        require(b.role == Role.EXECUTOR, "ROLE");
        tokenId = nextTokenId++;
        _safeMint(to, tokenId);
        baseOf[tokenId] = b;
        executorOf[tokenId] = e;
        emit ExecutorMinted(tokenId, to, e.intentId, b.agentManifestHash);
    }

    function mintWatcher(address to, AgentBase calldata b, WatcherExt calldata w)
        external
        onlyOwner
        returns (uint256 tokenId)
    {
        require(b.role == Role.WATCHER, "ROLE");
        tokenId = nextTokenId++;
        _safeMint(to, tokenId);
        baseOf[tokenId] = b;
        watcherOf[tokenId] = w;
        emit WatcherMinted(tokenId, to, w.watchedExecutorTokenId);
    }

    /// @notice Set the ERC-8004 registration JSON URI. Done after identity setup (mock 050).
    function setTokenURI(uint256 tokenId, string calldata uri) external onlyOwner {
        _requireOwned(tokenId);
        _tokenURI[tokenId] = uri;
        emit TokenURISet(tokenId, uri);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenURI[tokenId];
    }
}
