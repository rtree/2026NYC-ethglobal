// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IntentOS shared types
/// @notice Frozen data contract. Mirrors plan/010-interfaces.md §9 / §11.
///         Kept in one file so the TS `@intentos/shared` mirror has a single source.

/// @dev Trade direction. BUY: tokenA->tokenB, SELL: tokenB->tokenA, RECOVER: ->stable (tokenA).
enum Action {
    BUY,
    SELL,
    RECOVER
}

/// @notice The enforceable boundary of the Owner Intent, burned 1:1 from CONSTRAINTS.json (010 §9).
struct HardGuardState {
    address router; // target allowlist (Uniswap router) — single entry in MVP
    bytes4 selector; // selector allowlist (exactInputSingle) — single entry in MVP
    address tokenA; // tokenPair allowlist (USDC)
    address tokenB; // tokenPair allowlist (WETH)
    uint24 poolFee; // Uniswap v3 fee tier for the allowed pool
    uint256 amountCapPerTx; // per-tx upper bound (tokenIn units)
    uint256 cumulativeCap; // cumulative upper bound (spender cap, tokenIn units)
    uint16 slippageCapBps; // allowed slippage (bps, 50 = 0.5%)
    uint64 expiry; // expiry of the whole guard
    bool frozen; // true stops all execution
    uint256 bindingNonce; // tied to Runtime Binding (010 §10); transfer invalidates
}

/// @notice One typed trade for this tick (010 §9). Assembled by the adapter, never arbitrary calldata.
///         The SessionKey signs a digest of this struct; `reasonHash` binds the evidence reason string.
struct ExecutionRequest {
    bytes32 intentId;
    uint256 executorAgentTokenId;
    uint8 action; // Action
    address tokenIn;
    address tokenOut;
    address recipient; // must == address(this) (the Owner EOA)
    uint256 amountIn;
    uint256 minAmountOut; // derived from slippageCap
    uint256 quotedAmountOut;
    uint16 slippageBps;
    uint256 nonce; // per-trade replay nonce
    uint64 deadline;
    uint256 bindingNonce;
    bytes32 quoteHash;
    bytes32 simulationHash;
    bytes32 evidenceRoot;
    bytes32 reasonHash; // keccak256(bytes(reason)); binds the emitted reason to the signature
}

/// @notice The tightenable subset a Watcher may narrow (monotonic only, 010 §14).
struct GuardPatch {
    uint256 amountCapPerTx;
    uint256 cumulativeCap;
    uint16 slippageCapBps;
    uint64 expiry;
}

/// @notice Canonical custom errors (010 §9).
interface IIntentOSErrors {
    error NotInitialized();
    error AlreadyInitialized();
    error NotOwner();
    error NotRelayer();
    error BadBindingNonce();
    error BadToken();
    error BadRecipient();
    error AmountTooLarge();
    error CumulativeCapExceeded();
    error SlippageTooHigh();
    error Expired();
    error NonceUsed();
    error GuardIsFrozen();
    error BadSignature();
    error NotTightening();
    error GasVaultDepleted();
    error ReasonMismatch();
    error ReasonTooLong();
}

/// @notice Canonical onchain audit event (010 §11). The audit origin — not an offchain log.
interface IEvidence {
    event EvidenceCommitted(
        uint256 indexed executorAgentTokenId,
        bytes32 indexed intentId,
        bytes32 indexed executionId,
        uint8 action,
        bytes32 packageHash,
        bytes32 hardGuardHash,
        bytes32 semanticGuardHash,
        bytes32 evidenceRoot,
        bytes32 quoteHash,
        bytes32 simulationHash,
        bytes32 executionRequestHash,
        bytes32 resultHash,
        string reason
    );
}
