# 140 — Research: x402 Receipt NFT + AgentFund

Status: Draft research
Created: 2026-06-15
Related: [130-issue-pivot-x402-funded-executor.md](130-issue-pivot-x402-funded-executor.md)

## 1. Product metaphor

The target interaction is a game-center coin slot:

```text
coin in: x402 payment + Intent
  -> Receipt / Agent NFT is minted
  -> AgentFund is credited
  -> Executor Agent starts trading by itself

receipt in: Receipt holder redeems
  -> runtime stops unconditionally
  -> remaining Fund is sent to the Receipt holder
  -> Receipt is burned or marked redeemed
```

The buyer should not feel like they are configuring custody, delegations, gas, relayers, or cloud
schedulers. They insert value and intent. The system issues a transferable receipt that is also the
handle for the live agent and its remaining funded balance.

## 2. Feasibility verdict

Feasible, but not as a thin patch on the current EIP-7702 Owner-EOA model.

The current MVP proves guarded execution when funds live inside the Owner EOA. The coin-slot product
needs a new `AgentFund` authority boundary because the Fund must follow an NFT/Receipt. EOA-held funds
cannot automatically move when an ERC721 transfers.

The strongest product shape is:

```text
x402 payment settles into an AgentFund address
  -> mint AgentReceiptNFT(tokenId)
  -> tokenId controls AgentFund claim + runtime authority
  -> Executor SessionKey can spend only through AgentFund guardrails
  -> burn/redeem tokenId to stop and refund remaining assets
```

x402 is ideal for the coin-in side. It is not, by itself, an ERC721 receipt-deposit/refund protocol.
The receipt-in side should be an IntentOS on-chain `redeem(tokenId)` or `stopAndRefund(tokenId)` action,
or a custom x402 extension later.

## 3. x402 facts relevant to this design

Sources reviewed:

- [x402 homepage](https://www.x402.org/)
- [CDP x402 overview](https://docs.cdp.coinbase.com/x402/welcome)
- [How x402 Works](https://docs.cdp.coinbase.com/x402/core-concepts/how-it-works)
- [Facilitator](https://docs.cdp.coinbase.com/x402/core-concepts/facilitator)
- [Network Support](https://docs.cdp.coinbase.com/x402/network-support)
- [Quickstart for Sellers](https://docs.x402.org/getting-started/quickstart-for-sellers)
- [exact EVM scheme](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md)

Important facts:

- x402 is HTTP-native: request -> `402 Payment Required` -> client retries with `PAYMENT-SIGNATURE`.
- The resource server can verify locally or use a facilitator `/verify` endpoint.
- The resource server settles directly or through facilitator `/settle`.
- A successful response can include `PAYMENT-RESPONSE` with settlement details.
- The facilitator verifies and broadcasts; it does not custody funds or change amount/destination.
- CDP facilitator supports Base mainnet `eip155:8453`, including USDC at
  `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
- EVM x402 supports:
  - `EIP-3009` for USDC/EURC-style gasless `transferWithAuthorization`.
  - `Permit2` for generic ERC20, with optional gas sponsorship extensions.
  - `ERC-7710` for smart-account delegation flows.
- The `exact` scheme moves a fixed advertised amount.
- The `upto` scheme authorizes a maximum and lets the server settle less, useful for usage billing.
- `batch-settlement` is better for frequent microcharges, not necessary for first coin-in funding.

Implication for IntentOS:

- Start with Base USDC + `exact` x402 payment for coin-in.
- Treat the x402 settlement tx as the funding proof.
- Mint only after settlement succeeds, or mint a pending receipt that is inactive until settlement.
- Use the settlement tx hash + payment payload hash as idempotency keys.

## 4. Current code fit and mismatch

Reusable:

- `AgentNFT` already mints an ERC721 identity with package hashes.
- `ExecutionDelegate7702` already enforces typed requests, caps, slippage, freeze, nonce, and evidence.
- Runtime package already builds `ExecutionRequest`, signs with KMS, and relays with receipt checks.
- Server already has IntentBuilder, package FIX, runtime records, OpenClaw calls, Firestore, and auth.

Mismatch:

- `AgentNFT.ExecutorExt.fundOwner` is currently an address that holds funds; transfer does not move
  custody.
- `ExecutionDelegate7702` spends from `address(this) == Owner EOA` and reimburses gas from ETH held in
  that same account.
- Owner self-calls are required for initialize/fund/resume in the current model.
- Watcher gas vaults and Watcher runtime are extra complexity for the first paid product.

Therefore, the paid Receipt model should not try to force every buyer through EIP-7702 activation.
It should introduce a Fund-bearing contract/account controlled by the receipt token.

## 5. Design options

### Option A — Off-chain ledger + platform custody

Flow:

```text
x402 payTo = platform wallet
server records settlementTxHash -> fund balance in Firestore
server mints Receipt NFT
runtime trades using platform-owned funds / platform account
redeem burns Receipt NFT and server sends remaining balance
```

Pros:

- Fastest to ship.
- Minimal Solidity change.
- Easy x402 integration because `payTo` is just platform wallet.
- Good prototype for UX.

Cons:

- Custodial and trust-heavy.
- Receipt transfer has to be mirrored off-chain.
- Refund depends on server honesty and hot-wallet solvency.
- Weak fit for public ERC-8004 / EIP-8004 claim of transferable funded agent.

Verdict: acceptable only for a throwaway prototype or internal demo, not the product target.

### Option B — AgentFund escrow contract keyed by tokenId

Flow:

```text
server creates pending fundId and precomputes/payTo AgentFund address
x402 settles USDC directly into AgentFund / FundFactory
server verifies settlement and mints AgentReceiptNFT(tokenId)
tokenId maps to Fund balance and guardrails
SessionKey can execute only through AgentFund.execute(request)
Receipt holder calls redeem(tokenId) to stop and refund remaining assets
```

Pros:

- Fund is on-chain and auditable.
- Receipt transfer can move claim by checking `ownerOf(tokenId)` at call time.
- Old runtime can be invalidated on transfer/redeem.
- Keeps x402 coin-in simple with Base USDC exact payments.

Cons:

- Contract work needed: AgentFund, Receipt NFT, guard/execution integration.
- Gas reimbursement cannot be the existing EOA ETH lane. Need a relayer reimbursement model.
- If trading produces WETH or multiple assets, refund policy must decide whether to return assets as-is
  or swap back before refund.

Verdict: best first real product architecture if we want control and clear semantics.

### Option C — ERC-6551 / token-bound Agent account

Flow:

```text
mint AgentReceiptNFT
AgentReceiptNFT has token-bound account (TBA)
x402 payment settles into the TBA
TBA executes guarded trades through a module/session key
NFT transfer naturally transfers control of the TBA
redeem burns/stops and withdraws from TBA to current owner
```

Pros:

- Very clean mental model: the NFT literally has an account that owns the Fund.
- Transfer semantics are natural: whoever owns the NFT controls the account.
- Public story is strong for agent identity and ERC-8004/EIP-8004.

Cons:

- More moving parts: ERC-6551 registry/account, guarded execution module, relayer/paymaster.
- x402 payTo needs either pre-minted tokenId/TBA or deterministic pending account creation.
- Runtime/session-key permissioning must be designed carefully.

Verdict: elegant medium-term target. Might be the cleanest public architecture, but slower than Option B.

### Option D — Per-agent EOA / EIP-7702 account

Flow:

```text
server creates per-agent EOA key in KMS
x402 pays into that EOA
server delegates EOA with EIP-7702 or controls it as a guarded agent account
Agent NFT represents key/runtime rights
transfer rotates server-side authority
```

Pros:

- Reuses more of current EIP-7702 code.
- Funds can sit in a single account address.

Cons:

- The key is effectively platform-controlled; transfer does not naturally move custody.
- Hard to make owner-controlled refund trustless.
- KMS key lifecycle and transfer semantics get awkward.

Verdict: not recommended for the product claim. Good only as a transitional implementation detail.

## 6. Recommended architecture

Start with Option B, keep Option C as the aspirational shape.

Recommended first product contracts:

```text
AgentReceiptNFT
  tokenId
  intentHash
  packageHash
  fundId
  status: FUNDED | RUNNING | STOPPING | REDEEMED
  tokenURI -> ERC-8004-compatible registration JSON

AgentFund
  tokenId -> balances(asset)
  tokenId -> guard
  tokenId -> sessionKey
  tokenId -> relayer
  tokenId -> bindingNonce
  tokenId -> status

RuntimeRegistry
  tokenId -> runtimeId / cloudRunService / lease / lastHeartbeat
  validates ownerOf(tokenId) and status before each tick
```

The AgentReceiptNFT and AgentFund may be one contract or two contracts. Two contracts are cleaner:
NFT for identity/ownership, Fund for asset accounting and execution.

## 7. Coin-in flow

```text
1. Buyer POST /api/x402/agents with Intent body.
2. Server hashes Intent body -> intentHash.
3. Server returns x402 PaymentRequirements:
   scheme=exact
   network=eip155:8453
   asset=Base USDC
   payTo=AgentFund receiver or platform receiver depending on chosen phase
   amount=initial Fund
   resource includes intentHash / pendingFundId
4. Buyer retries with PAYMENT-SIGNATURE.
5. Server verifies and settles through facilitator.
6. After settlement success:
   - record paymentPayloadHash + settlementTxHash idempotently
   - mint AgentReceiptNFT
   - create AgentFund record / on-chain balance mapping
   - create/FIX Executor package from supplied Intent
   - start bounded runtime
7. Response returns tokenId, fundId, runtimeId, settlementTxHash.
```

Important: do not mint an active trade-capable NFT before settlement succeeds. A pending receipt is okay
only if it cannot trade or redeem until settlement is confirmed.

## 8. Runtime execution flow

```text
1. Runtime tick loads tokenId and packageHash.
2. RuntimeRegistry checks:
   ownerOf(tokenId) still matches runtimeOwner or transfer policy
   AgentFund status is RUNNING
   bindingNonce is current
   budget/cost caps remain
3. OpenClaw decides BUY/HOLD.
4. Adapter builds typed AgentFundExecutionRequest.
5. KMS SessionKey signs request.
6. Platform relayer submits AgentFund.execute(request, sig).
7. AgentFund checks guardrails and executes swap from its own balances.
8. AgentFund reimburses relayer from Fund gas lane or deducts stablecoin gas fee.
9. Evidence event is emitted with tokenId, fundId, intentHash, requestHash, resultHash.
```

The current `ExecutionDelegate7702` is a useful reference, but `AgentFund.execute` should be a new
contract surface because `recipient == address(this)` and custody/accounting are different.

## 9. Receipt-in / refund flow

The user phrase says "x402でReceiptを入金". In strict x402 terms, x402 does not natively settle ERC721
receipt deposits. It settles payment assets such as USDC via EIP-3009/Permit2 or supported schemes.

Recommended product implementation:

```text
Receipt holder calls AgentFund.redeem(tokenId, refundPolicy)
  -> require ownerOf(tokenId) == msg.sender or approved
  -> status = STOPPING / REDEEMED
  -> bindingNonce++ so old runtime requests fail
  -> RuntimeRegistry marks runtime stopped
  -> transfer remaining assets to current Receipt holder
  -> burn Receipt NFT or mark redeemed
```

This can be exposed in the UI as "Insert receipt / cash out" even if the technical primitive is a
normal on-chain redeem call rather than x402.

Possible later x402-like receipt-in variants:

- Custom x402 scheme that accepts an ERC721 transfer/burn proof. This is elegant but non-standard and
  requires facilitator/client support.
- HTTP endpoint that requires a wallet signature proving Receipt ownership, then server sponsors the
  on-chain redeem. Easier UX, but the server becomes an action sponsor and must guard against abuse.
- ERC-4337/paymaster redeem: holder signs a UserOperation, platform sponsors gas, Fund repays.

## 10. Refund policy

"Send the money back" needs precise semantics because the agent may have traded.

Possible policies:

1. Return assets as-is.
   - If Fund holds USDC and WETH, send both to Receipt holder.
   - Simple, honest, no forced slippage.
2. Convert to payment asset before refund.
   - Swap WETH -> USDC before sending.
   - UX is simpler, but needs slippage constraints and can fail in bad markets.
3. User chooses at creation.
   - `refundPolicy = AS_IS | TO_PAYMENT_ASSET`.
   - Best product path.

Unconditional guarantee should mean: stop future trading immediately and return remaining assets under
the chosen refund policy. It cannot mean returning the original x402 amount after losses, gas, fees, or
market movement.

## 11. Gas model

A contract-owned Fund cannot pay transaction gas by itself. A relayer/paymaster is still needed.

Options:

- ETH gas lane: convert a slice of USDC to ETH/WETH and keep ETH in AgentFund for relayer reimbursement.
- Stablecoin gas lane: relayer pays gas, AgentFund reimburses a capped USDC amount per tx using an oracle
  or fixed fee schedule.
- Platform subscription/fee: x402 amount splits into trading capital + gas/service fee; platform covers
  gas operationally.
- ERC-4337 paymaster: paymaster fronts gas and charges the Fund. More complex but clean long-term.

For first implementation, use stablecoin gas lane with hard caps:

```text
fund.total = tradingBalance + gasReserve + serviceFee
maxGasFeePerTxUsdc
maxGasFeeTotalUsdc
maxTrades
maxRuntimeMinutes
```

This matches the coin-slot UX: the coin buys a bounded run, and the machine stops when the coin is used.

## 12. Security invariants

- One x402 settlement can mint at most one Receipt NFT.
- Receipt NFT transfer must invalidate old runtime authority or force runtime pause.
- Redeem must invalidate runtime authority before transferring funds.
- SessionKey can only sign typed requests bound to tokenId, fundId, chainId, contract address, nonce,
  bindingNonce, packageHash, and guard hash.
- Relayer reimbursement must be capped and cannot drain trading balance unexpectedly.
- If runtime is stopped/redeemed, all pending requests fail on-chain.
- The server must not trust a claimed payment without facilitator verification and settlement.
- Intent body and payment must be bound by `intentHash` / `pendingFundId` in the x402 resource metadata.
- Refund must handle all held assets or explicitly reject unsupported dust assets.

## 13. Suggested first implementation slice

1. Add `AgentReceiptNFT` / `AgentFund` SDD to [030-sdd-contracts.md](030-sdd-contracts.md).
2. Add shared types to [010-interfaces.md](010-interfaces.md): `X402PaymentRecord`, `AgentFundState`,
   `ReceiptStatus`, `RefundPolicy`, `AgentFundExecutionRequest`.
3. Build server-only x402 prototype on Base Sepolia:
   - `POST /api/x402/agents` returns/accepts x402 payment.
   - settle to platform wallet first for quick proof.
   - mint mocked/off-chain receipt record after settlement.
4. In parallel, design AgentFund contract for Base mainnet:
   - custody keyed by tokenId;
   - execute guarded swaps;
   - redeem and transfer remaining assets;
   - emit evidence.
5. Replace platform-custody prototype with on-chain AgentFund receiver.
6. Publish ERC-8004 registration JSON for each Receipt/Agent token.

## 14. Recommendation

Build the first proof in two layers:

- UX proof: x402 exact Base USDC payment + Intent -> Receipt record/NFT -> bounded runtime entry.
- Protocol proof: AgentFund contract keyed by Receipt NFT, with redeem stop/refund and transfer
  invalidation.

Do not try to make x402 itself handle ERC721 receipt deposits in v1. Use x402 for coin-in, and use
IntentOS contracts for receipt-in/refund. That keeps the product metaphor intact while staying close to
what x402 already supports.
