# IntentOS — SDD 1: Contracts (Solidity)

The Chain layer = final authority (010 §5). This component is the only thing that moves Owner funds.
Anchors: [010 §6](010-interfaces.md) (Agent NFT model), [§9](010-interfaces.md) (ExecutionRequest &
HardGuardState), [§10](010-interfaces.md) (Binding & enforce points), [§11](010-interfaces.md)
(EvidenceCommitted). Realizes the guardrail behavior shown on mocks 040 / 090 / 110.

Project: **Foundry**. Target: **Base mainnet (8453)**.

## 1. Contract inventory

```text
ExecutionDelegate7702   the EIP-7702 delegate code the Owner EOA points to.
                        holds HardGuardState, accounting, gas vault lanes; executes guarded swaps;
                        emits EvidenceCommitted; accepts watcher tighten/freeze.
AgentNFT                ERC721 + ERC-8004 registration for Executor & Watcher agents.
```

For the MVP the Watcher "vote contract" of 010 §10 is **folded into** `ExecutionDelegate7702` as
guarded `watcherTighten` / `watcherFreeze` entrypoints (quorum=1). A standalone vote/quorum contract
is a post-MVP extraction; the function surface stays the same.

---

## 2. ExecutionDelegate7702

The Owner runs `signAuthorization` (EIP-7702) so their EOA executes this code. Therefore
`address(this) == Owner EOA`, and "the Owner's funds" are simply this account's USDC/WETH/ETH balances.

### 2.1 Storage (mirrors 010 §9 HardGuardState + accounting)

```solidity
struct HardGuardState {
    address router;          // target allowlist (Uniswap router) — single entry in MVP
    bytes4  selector;        // selector allowlist — single entry in MVP
    address tokenA;          // tokenPair allowlist (USDC)
    address tokenB;          // tokenPair allowlist (WETH)
    uint256 amountCapPerTx;
    uint256 cumulativeCap;
    uint16  slippageCapBps;  // 50 = 0.5%
    uint64  expiry;
    bool    frozen;
    uint256 bindingNonce;    // tied to Runtime Binding (010 §10)
}

HardGuardState  internal _guard;
bool            internal _initialized;
uint256         internal _cumulativeSpent;
mapping(uint256 => bool) internal _usedNonce;   // execution nonce (replay)
address         internal _sessionKey;           // Executor SessionKey (KMS) pubkey-derived addr
address         internal _watcherKey;           // Watcher SessionKey; address(0) if Executor-only
uint256         internal _execGasVault;          // executor lane (wei accounted; backed by this.balance)
uint256         internal _watcherGasVault;       // watcher lane (separate)
address         internal _relayer;               // allowed reimbursement recipient
bytes32         internal _packageHash;           // committed Agent Package (body offchain)
bytes32         internal _semanticGuardHash;
```

Lanes are accounting over `address(this).balance` (the Owner EOA's ETH), not separate accounts —
exactly 010 §10 / North Star "vault lane".

### 2.2 Lifecycle & functions

```solidity
// one-time burn of CONSTRAINTS.json -> HardGuardState. Owner-authed (msg.sender == address(this)).
function initialize(HardGuardState calldata g, address sessionKey, address relayer,
                    bytes32 packageHash, bytes32 semanticGuardHash) external;

// fund either lane with ETH (010 §10). onlyOwner (== address(this) via 7702 self-call, or owner EOA).
function fundGasVault(bool watcherLane) external payable;

// the ONLY execution entrypoint. called by the relayer; authority is the SessionKey signature.
function submitExecutionRequest(ExecutionRequest calldata r, bytes calldata sig) external;

// watcher, quorum=1: monotonic tighten only. authority = _watcherKey signature.
function watcherTighten(GuardPatch calldata p, bytes calldata sig) external;
function watcherFreeze(bytes calldata sig) external;

// owner-only loosen/stop (010 §14: only Owner can loosen).
function ownerUpdateGuard(HardGuardState calldata g) external;  // can loosen or tighten
function ownerStop() external;                                  // frozen=true + drain refund
function rotateBinding(uint256 newNonce, address newSessionKey) external; // 010 §10 transfer expiry

// views for the dashboards (mocks 090/110)
function guard() external view returns (HardGuardState memory);
function cumulativeSpent() external view returns (uint256);
function gasVaults() external view returns (uint256 exec, uint256 watcher);
```

`ExecutionRequest` and `GuardPatch` match 010 §9 (GuardPatch = the tightenable subset:
`amountCapPerTx`, `cumulativeCap`, `slippageCapBps`, `expiry`).

### 2.3 submitExecutionRequest — check order (010 §9, mechanical)

```text
require _initialized                                  else NotInitialized
require r.bindingNonce == _guard.bindingNonce         else BadBindingNonce
require r.tokenIn/tokenOut in {tokenA,tokenB} & r.recipient == address(this)  else BadToken/BadRecipient
require r.amountIn <= _guard.amountCapPerTx            else AmountTooLarge
require _cumulativeSpent + r.amountIn <= cumulativeCap else CumulativeCapExceeded
require r.slippageBps <= _guard.slippageCapBps         else SlippageTooHigh
require block.timestamp <= min(r.deadline,_guard.expiry) else Expired
require !_usedNonce[r.nonce]                           else NonceUsed
require !_guard.frozen                                 else GuardIsFrozen
require recover(digest(r), sig) == _sessionKey        else BadSignature
-- all inside:
_usedNonce[r.nonce]=true; _cumulativeSpent += r.amountIn
approve(router, tokenIn, amountIn); call router.selector(...) with minAmountOut
verify received >= r.minAmountOut (post-swap), else revert SlippageTooHigh
emit EvidenceCommitted(...)
_reimburseRelayer(execLane)
```

Custom errors (010 §9): `AmountTooLarge, CumulativeCapExceeded, SlippageTooHigh, Expired, BadToken,
BadRecipient, NonceUsed, BadBindingNonce, GuardIsFrozen, BadSignature, NotInitialized`.

### 2.4 Digest & signature (010 §9)

```text
digest = EIP191( keccak256(abi.encode(block.chainid, address(this), r_without_sig)) )
recover(digest, sig) == _sessionKey
```

`chainid` + `address(this)` (the Owner EOA) prevent cross-chain / cross-contract replay. The digest
carries no natural-language intent — only the typed trade.

### 2.5 Gas reimbursement (North Star "who pays gas")

```text
spent  = usedGas * tx.gasprice
spent  = min(spent, gasPerTxCap)                 // clamp; overflow is Platform's cost
require spent <= laneBalance                       else lane revert (fund-exhausted path, 010 §13)
laneBalance -= spent
(bool ok,) = _relayer.call{value: spent}("")       // address(this)=Owner ETH -> relayer
```

Executor lane reimburses `submitExecutionRequest`; watcher lane reimburses
`watcherTighten`/`watcherFreeze`. Lanes never cross (010 §14).

### 2.6 Watcher tighten/freeze — monotonic (010 §14)

```text
watcherTighten(p, sig): require recover==_watcherKey
  require p.amountCapPerTx   <= _guard.amountCapPerTx
  require p.cumulativeCap    <= _guard.cumulativeCap
  require p.slippageCapBps   <= _guard.slippageCapBps
  require p.expiry           <= _guard.expiry
  apply; emit GuardTightened(...)
watcherFreeze(sig): require recover==_watcherKey; _guard.frozen=true; emit GuardFrozen(...)
```

Any non-tightening value reverts with `NotTightening`. Unfreeze / loosen exist **only** on the
owner path. This is "the Watcher can only tighten; only the Owner can loosen" in code.

### 2.7 Events

```solidity
event EvidenceCommitted(/* exactly 010 §11 */);
event GuardInitialized(bytes32 packageHash, bytes32 hardGuardHash);
event GuardTightened(bytes32 newHardGuardHash, address by);
event GuardFrozen(address by);
event GasFunded(bool watcherLane, uint256 amount);
event RelayerReimbursed(bool watcherLane, uint256 amount);
event BindingRotated(uint256 newNonce);
```

`hardGuardHash` = `keccak256(abi.encode(_guard))`, recomputed on every change so the dashboards and
EvidenceCommitted reference a stable guard fingerprint.

---

## 3. AgentNFT (010 §6)

ERC721 + ERC-8004 registration. One contract, `role` distinguishes Executor/Watcher.

```solidity
enum Role { EXECUTOR, WATCHER }

struct AgentBase {
    Role    role;
    bytes32 agentManifestHash;   // == Agent Package manifest.json packageHash
    bytes32 runtimeManifestHash;
}
struct ExecutorExt { address fundOwner; bytes32 intentId; address executionContract; bytes32 hardGuardrailsHash; }
struct WatcherExt  { uint256 watchedExecutorTokenId; bytes32 watchedIntentId; bytes32 executorPackageHash;
                     bytes32 hardGuardrailsHash; bytes32 semanticGuardrailsHash; bytes32 watcherPackageHash; uint256 quorumSetId; }

function mintExecutor(address to, AgentBase calldata b, ExecutorExt calldata e) external returns (uint256 tokenId);
function mintWatcher (address to, AgentBase calldata b, WatcherExt calldata w) external returns (uint256 tokenId);
function tokenURI(uint256 tokenId) external view returns (string memory); // -> ERC-8004 registration JSON
```

`(future)` fields from 010 §6 (`erc8004RegistrationHash`, `revenueReceiver`, `kmsPolicyHash`,
`gasVaultPolicyHash`) are **not** written in MVP; struct shape leaves room. `fundOwner` on the NFT
does not move custody — funds stay in the Owner EOA delegate (§2). Transfer moves identity + runtime
usage right only; authority is re-checked via `bindingNonce` (010 §10).

---

## 4. Security considerations

- **Reentrancy**: state updates (`_usedNonce`, `_cumulativeSpent`, lane debit) before external
  router call and relayer transfer; `nonReentrant` on `submitExecutionRequest`.
- **Allowlist**: only `router`/`selector`/`tokenA`/`tokenB` from HardGuardState; `recipient` must be
  `address(this)`. No arbitrary calldata reaches the chain (010 §5).
- **Replay**: per-trade `nonce` + `chainid`+`address(this)` in the digest; `bindingNonce` kills old
  Runtime requests after transfer.
- **Monotonic watcher**: tighten/freeze can only narrow; enforced by `require` (§2.6).
- **Gas griefing**: `gasPerTxCap` clamp; lane balance check; relayer is a fixed allowlisted address.
- **Slippage**: enforced both by `slippageBps <= cap` and a post-swap `received >= minAmountOut`.

---

## 5. Test plan (Foundry) — maps to invariants (010 §14)

```text
unit: each custom error path in §2.3 reverts exactly (AmountTooLarge, CumulativeCapExceeded, ...)
unit: digest/signature — wrong key -> BadSignature; replayed nonce -> NonceUsed
unit: monotonic watcher — any loosening patch -> NotTightening; freeze blocks execution
unit: reimbursement math — clamp at gasPerTxCap; lane depletion -> revert (fund-exhausted)
invariant: cumulativeSpent <= cumulativeCap always
invariant: watcher can never increase any cap or unfreeze
invariant: funds only leave via an inside-guardrails swap; lanes never cross
fork test: real USDC/WETH swap on a Base fork through the Uniswap router allowlist
```
