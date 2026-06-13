// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {Action, HardGuardState, ExecutionRequest, GuardPatch, IIntentOSErrors, IEvidence} from "./IntentOSTypes.sol";
import {ISwapRouter02} from "./interfaces/ISwapRouter02.sol";

/// @title ExecutionDelegate7702
/// @notice The EIP-7702 delegate code the Owner EOA points to. Because the Owner runs
///         `signAuthorization`, this code executes with `address(this) == Owner EOA`, so "the Owner's
///         funds" are simply this account's USDC / WETH / ETH balances.
/// @dev    Final authority of the system (plan/010-interfaces.md §5). It trusts no reasoning; it only
///         checks a typed ExecutionRequest against HardGuardState (§9) and executes if inside.
contract ExecutionDelegate7702 is IIntentOSErrors, IEvidence {
    using SafeERC20 for IERC20;

    // --- guard + accounting (mirrors 010 §9) ---
    HardGuardState internal _guard;
    bool internal _initialized;
    uint256 internal _cumulativeSpent;
    mapping(uint256 => bool) internal _usedNonce;

    // --- authority keys / addresses ---
    address internal _sessionKey; // Executor SessionKey (KMS) — signs ExecutionRequest digests
    address internal _watcherKey; // Watcher SessionKey — signs tighten/freeze; 0 if Executor-only
    address internal _relayer; // allow-listed gas sponsor / submitter

    // --- gas vault lanes (010 §10): accounting over address(this).balance ---
    uint256 internal _execGasVault;
    uint256 internal _watcherGasVault;
    uint256 internal _gasPerTxCap;

    // --- evidence context ---
    bytes32 internal _packageHash;
    bytes32 internal _semanticGuardHash;

    uint256 internal constant MAX_REASON_BYTES = 200;
    uint256 internal _lock; // minimal non-reentrancy

    event GuardInitialized(bytes32 packageHash, bytes32 hardGuardHash);
    event GuardTightened(bytes32 newHardGuardHash, address by);
    event GuardFrozen(address by);
    event GasFunded(bool watcherLane, uint256 amount);
    event RelayerReimbursed(bool watcherLane, uint256 amount);
    event BindingRotated(uint256 newNonce);
    event OwnerStopped();

    modifier onlyOwner() {
        // In EIP-7702, an Owner-initiated self-call has msg.sender == address(this).
        if (msg.sender != address(this)) revert NotOwner();
        _;
    }

    modifier onlyRelayer() {
        if (msg.sender != _relayer) revert NotRelayer();
        _;
    }

    modifier nonReentrant() {
        require(_lock == 0, "REENTRANCY");
        _lock = 1;
        _;
        _lock = 0;
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    /// @notice One-time burn of CONSTRAINTS.json -> HardGuardState (010 §9). Owner-authed.
    function initialize(
        HardGuardState calldata g,
        address sessionKey,
        address watcherKey,
        address relayer,
        uint256 gasPerTxCap,
        bytes32 packageHash,
        bytes32 semanticGuardHash
    ) external onlyOwner {
        if (_initialized) revert AlreadyInitialized();
        _guard = g;
        _sessionKey = sessionKey;
        _watcherKey = watcherKey;
        _relayer = relayer;
        _gasPerTxCap = gasPerTxCap;
        _packageHash = packageHash;
        _semanticGuardHash = semanticGuardHash;
        _initialized = true;
        emit GuardInitialized(packageHash, _hardGuardHash());
    }

    /// @notice Earmark part of the Owner EOA's ETH to a gas reimbursement lane (010 §10).
    /// @dev No value transfer — `address(this)` already holds the ETH. We only move the accounting
    ///      counter, keeping `exec + watcher <= address(this).balance`.
    function fundGasVault(bool watcherLane, uint256 amount) external onlyOwner {
        if (!_initialized) revert NotInitialized();
        if (watcherLane) _watcherGasVault += amount;
        else _execGasVault += amount;
        require(_execGasVault + _watcherGasVault <= address(this).balance, "OVER_ALLOCATED");
        emit GasFunded(watcherLane, amount);
    }

    // -------------------------------------------------------------------------
    // Execution (the only path that moves funds)
    // -------------------------------------------------------------------------

    /// @notice Submit a guarded trade. Called by the relayer; authority is the SessionKey signature.
    /// @param r      the typed ExecutionRequest (010 §9)
    /// @param reason evidence annotation (<=200 ASCII); must hash to r.reasonHash
    /// @param sig    SessionKey signature over the EIP-191 digest of `r`
    function submitExecutionRequest(ExecutionRequest calldata r, string calldata reason, bytes calldata sig)
        external
        onlyRelayer
        nonReentrant
    {
        uint256 gasStart = gasleft();

        if (bytes(reason).length > MAX_REASON_BYTES) revert ReasonTooLong();
        if (keccak256(bytes(reason)) != r.reasonHash) revert ReasonMismatch();

        // --- mechanical checks, in the exact order of 010 §9 (reasoning never trusted) ---
        _checkGuard(r);
        if (_usedNonce[r.nonce]) revert NonceUsed();
        if (ECDSA.recover(_digest(r), sig) != _sessionKey) revert BadSignature();

        // --- effects before interactions ---
        _usedNonce[r.nonce] = true;
        _cumulativeSpent += r.amountIn;

        // --- swap from the Owner balance, recipient is this account ---
        uint256 received = _swap(r);
        if (received < r.minAmountOut) revert SlippageTooHigh();

        bytes32 executionId = keccak256(abi.encode(r.intentId, r.nonce));
        bytes32 resultHash = keccak256(abi.encode(r.amountIn, received, block.number));
        emit EvidenceCommitted(
            r.executorAgentTokenId,
            r.intentId,
            executionId,
            r.action,
            _packageHash,
            _hardGuardHash(),
            _semanticGuardHash,
            r.evidenceRoot,
            r.quoteHash,
            r.simulationHash,
            keccak256(abi.encode(r)),
            resultHash,
            reason
        );

        _reimburse(false, gasStart);
    }

    /// @dev Mechanical guardrail checks shared by submit and the preflight view (010 §9, §12).
    function _checkGuard(ExecutionRequest calldata r) internal view {
        if (!_initialized) revert NotInitialized();
        if (r.bindingNonce != _guard.bindingNonce) revert BadBindingNonce();
        bool tokensOk = (r.tokenIn == _guard.tokenA || r.tokenIn == _guard.tokenB)
            && (r.tokenOut == _guard.tokenA || r.tokenOut == _guard.tokenB) && r.tokenIn != r.tokenOut;
        if (!tokensOk) revert BadToken();
        if (r.recipient != address(this)) revert BadRecipient();
        if (r.amountIn > _guard.amountCapPerTx) revert AmountTooLarge();
        if (_cumulativeSpent + r.amountIn > _guard.cumulativeCap) revert CumulativeCapExceeded();
        if (r.slippageBps > _guard.slippageCapBps) revert SlippageTooHigh();
        // minAmountOut must be consistent with the quote and the declared slippage
        if (r.minAmountOut < (r.quotedAmountOut * (10000 - r.slippageBps)) / 10000) revert SlippageTooHigh();
        if (block.timestamp > r.deadline || block.timestamp > _guard.expiry) revert Expired();
        if (_guard.frozen) revert GuardIsFrozen();
    }

    /// @notice eth_call preflight for the Guard -> LLM feedback loop (010 §12). Reverts with the same
    ///         custom error the real submit would, at zero gas, without needing a signature.
    function previewGuard(ExecutionRequest calldata r) external view {
        _checkGuard(r);
        if (_usedNonce[r.nonce]) revert NonceUsed();
    }

    function _swap(ExecutionRequest calldata r) internal returns (uint256 received) {
        IERC20(r.tokenIn).forceApprove(_guard.router, r.amountIn);
        received = ISwapRouter02(_guard.router).exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: r.tokenIn,
                tokenOut: r.tokenOut,
                fee: _guard.poolFee,
                recipient: address(this),
                amountIn: r.amountIn,
                amountOutMinimum: r.minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );
        IERC20(r.tokenIn).forceApprove(_guard.router, 0);
    }

    // -------------------------------------------------------------------------
    // Watcher: monotonic tighten / freeze only (010 §14)
    // -------------------------------------------------------------------------

    function watcherTighten(GuardPatch calldata p, bytes calldata sig) external onlyRelayer nonReentrant {
        uint256 gasStart = gasleft();
        if (!_initialized) revert NotInitialized();
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(
            keccak256(abi.encode(block.chainid, address(this), "TIGHTEN", p))
        );
        if (ECDSA.recover(digest, sig) != _watcherKey) revert BadSignature();
        if (
            p.amountCapPerTx > _guard.amountCapPerTx || p.cumulativeCap > _guard.cumulativeCap
                || p.slippageCapBps > _guard.slippageCapBps || p.expiry > _guard.expiry
        ) revert NotTightening();
        _guard.amountCapPerTx = p.amountCapPerTx;
        _guard.cumulativeCap = p.cumulativeCap;
        _guard.slippageCapBps = p.slippageCapBps;
        _guard.expiry = p.expiry;
        emit GuardTightened(_hardGuardHash(), msg.sender);
        _reimburse(true, gasStart);
    }

    function watcherFreeze(bytes calldata sig) external onlyRelayer nonReentrant {
        uint256 gasStart = gasleft();
        if (!_initialized) revert NotInitialized();
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(
            keccak256(abi.encode(block.chainid, address(this), "FREEZE", _guard.bindingNonce))
        );
        if (ECDSA.recover(digest, sig) != _watcherKey) revert BadSignature();
        _guard.frozen = true;
        emit GuardFrozen(msg.sender);
        _reimburse(true, gasStart);
    }

    // -------------------------------------------------------------------------
    // Owner: only the Owner can loosen / stop (010 §14)
    // -------------------------------------------------------------------------

    function ownerUpdateGuard(HardGuardState calldata g) external onlyOwner {
        if (!_initialized) revert NotInitialized();
        // Owner may loosen or tighten; bindingNonce is managed via rotateBinding only.
        uint256 keepNonce = _guard.bindingNonce;
        _guard = g;
        _guard.bindingNonce = keepNonce;
        emit GuardTightened(_hardGuardHash(), msg.sender);
    }

    function ownerStop() external onlyOwner {
        _guard.frozen = true;
        emit OwnerStopped();
    }

    /// @notice Express Runtime Binding expiry (010 §10). Raising the nonce reverts old requests.
    function rotateBinding(uint256 newNonce, address newSessionKey) external onlyOwner {
        _guard.bindingNonce = newNonce;
        _sessionKey = newSessionKey;
        emit BindingRotated(newNonce);
    }

    // -------------------------------------------------------------------------
    // Gas reimbursement (North Star "who pays gas")
    // -------------------------------------------------------------------------

    function _reimburse(bool watcherLane, uint256 gasStart) internal {
        uint256 used = gasStart - gasleft() + 30000; // + fixed overhead estimate
        uint256 spent = used * tx.gasprice;
        if (spent > _gasPerTxCap) spent = _gasPerTxCap; // clamp; overflow is Platform's cost
        if (watcherLane) {
            if (spent > _watcherGasVault) revert GasVaultDepleted();
            _watcherGasVault -= spent;
        } else {
            if (spent > _execGasVault) revert GasVaultDepleted();
            _execGasVault -= spent;
        }
        (bool ok,) = payable(msg.sender).call{value: spent}("");
        require(ok, "REIMBURSE_FAIL");
        emit RelayerReimbursed(watcherLane, spent);
    }

    // -------------------------------------------------------------------------
    // Digest / hashing
    // -------------------------------------------------------------------------

    /// @dev EIP-191 over keccak256(chainId, address(this), request). chainId + address(this) prevent
    ///      cross-chain / cross-contract replay (010 §9). The digest carries no natural-language intent.
    function _digest(ExecutionRequest calldata r) internal view returns (bytes32) {
        return MessageHashUtils.toEthSignedMessageHash(keccak256(abi.encode(block.chainid, address(this), r)));
    }

    function _hardGuardHash() internal view returns (bytes32) {
        return keccak256(abi.encode(_guard));
    }

    // -------------------------------------------------------------------------
    // Views (for the dashboards — mocks 090 / 110)
    // -------------------------------------------------------------------------

    function guard() external view returns (HardGuardState memory) {
        return _guard;
    }

    function cumulativeSpent() external view returns (uint256) {
        return _cumulativeSpent;
    }

    function gasVaults() external view returns (uint256 exec, uint256 watcher) {
        return (_execGasVault, _watcherGasVault);
    }

    function keys() external view returns (address sessionKey, address watcherKey, address relayer) {
        return (_sessionKey, _watcherKey, _relayer);
    }

    function isNonceUsed(uint256 nonce) external view returns (bool) {
        return _usedNonce[nonce];
    }

    function hardGuardHash() external view returns (bytes32) {
        return _hardGuardHash();
    }

    receive() external payable {}
}
