> English mirror of [000-northStar.md](000-northStar.md). The Japanese file is the source of truth; this file is kept in sync for global readers.

# IntentOS North Star

IntentOS is a layer protocol that solves the problems of AI-Agent-driven trading by using EIP-7702 to keep funds in the Owner's own wallet and install guardrails there, while a separate Agent watches the trading.

Agents are also minted as NFTs (ERC-8004 / ERC-721): as proof of access to the Owner's EIP-7702 delegated contract, and as a symbol of the right to access the AI Agent execution environment built in the cloud.

## Problems We Solve

### Problem 1: Balancing opportunity capture by the Agent against losses from a runaway Agent

```
A chance arrives while you sleep.
But approving every single time means missing the chance.
Yet handing the Agent full authority is scary.
```
- Onchain opportunities will not wait for a human to wake up and approve each time.
- But handing an Agent full authority over a wallet is far too dangerous.
- IntentOS sits between "approve every time" and "sign a blank check".
  - The Owner defines an Intent, and the Executor Agent goes after opportunities inside that Intent.
  - A contract created on the EOA as an EIP-7702 delegated contract enforces Hard Limits, and the
    Watcher Agent can only tighten / freeze future authority.
  - So the Agent can act even while the Owner is offline. But it can never leave the Owner's boundary.

### Problem 2: Running an Agent needs an isolated environment, and key & fund management is hard

```
Running an Agent on your own PC is unnerving.
But building an isolated environment is a lot of work.
And handing funds or keys to an isolated Agent is scarier still.
If you fear you can't recover them when it stops, you can't entrust them.
```
- To make an Agent truly autonomous, just writing a prompt is not enough. An Agent needs a PC to run
  its program, but running it on your own PC is unnerving. It stops if the PC sleeps, and putting API
  keys or session keys in your local environment is scary too.
- Conversely, building an isolated environment in the cloud means you now have to handle Runtime
  creation, privilege separation, key management, and security yourself.
- IntentOS provides the isolation, the keys, and the fund separation all together.
  - For each Agent, it automatically creates an OpenClaw Runtime Capsule on Cloud Run. It stays up and
    keeps ticking, so it does not stop even if your PC sleeps. The keys the Agent uses are managed by
    GCP KMS. What is handed to the Runtime is not a key that moves funds, but a session key (request
    capability) for issuing ExecutionRequests to the delegated contract attached to the Owner's EOA.
  - Funds always stay at the Owner's address. Using EIP-7702, the Owner's EOA itself is delegated the
    ExecutionContract code, so the private key stays with the Owner and funds never move to another
    account. The AI Agent trades by calling this ExecutionContract with guardrails, and the Owner's
    funds are operated within the guardrails the Owner agreed to in advance. The gas budget is also
    placed in the ExecutionGasVault inside this Owner's EIP-7702 delegated account, and the AI Agent
    holds no fund custody.
  - So there is no "fear of not recovering funds when it stops". The Owner can stop anytime, and any
    remaining funds stay on the Owner's side. Even if you transfer the Agent, the old Runtime's
    authority structurally expires, so no keys or funds are left stranded.

## 0. Overview

> The Executor Agent requests.
> The ExecutionContract pre-approves or stops.
> The Watcher Agent can only tighten.
> Only the Owner can loosen.

IntentOS interprets the fund Owner's Intent via an LLM and prepares it as an AI Agent / the AI Agent's
execution environment / an ExecutionContract. To protect the Owner's self-custody while granting the
AI Agent partial spending authority over funds, it creates a contract inside the Owner's EOA using
EIP-7702 and grants the AI Agent permission to use funds within the guardrails set there. These
guardrails are further strengthened by a dedicated Watcher Agent that judges the semantics of the
Intent and the situation.

Two AI Agents appear here. Both are also minted as NFTs (ERC-8004 / ERC-721), as proof of access to
the Owner's EIP-7702 delegated contract and as a symbol of the right to access the built AI Agent
execution environment.

- **Executor Agent** is the Agent that realizes the Owner's Intent. It runs on the OpenClaw Runtime
  and issues ExecutionRequests to the EIP-7702 ExecutionContract.
- **Watcher Agent** is a monitoring Agent the Owner prepares separately from the Executor Agent. It
  collects the Executor Agent's execution results and external situation changes, and if necessary
  revises the guardrail definitions inside the ExecutionContract in a more restrictive direction to
  narrow the future execution range.

```text
Intent
  -> AI Agent NFT
  -> OpenClaw Runtime
  -> Guarded Execution
       Hard Guardrails:
         EIP-7702 ExecutionContract
       Optional Semantic Guardrails:
         Watcher Agent NFTs
```

Note that both the Executor Agent and the Watcher Agent hold a so-called wallet as a SessionKey, but
hold no funds at all. Funds always remain at the Owner's address, so the Owner's self-custody is never
lost. Gas is also supplied from the ExecutionGasVault inside the Owner's EOA delegated contract.

### How does the Agent "execute on behalf of" the Owner's funds?

The point is: "funds are never handed to the Agent; they move only inside the Owner's own account."
The key is the EIP-7702 delegated account.

```
Owner EOA (funds stay here)
  └─ holds delegated account code via EIP-7702
        ├─ ExecutionContract (final authority)
        ├─ Hard Guardrails (typed constraints)
        ├─ ExecutionGasVault (supplies gas to the agent)
```

With EIP-7702, "contract code" is bolted onto the Owner's EOA itself. Funds are not moved to another
account; they stay as the Owner's balance. Inside that Owner account's code, the ExecutionContract and
the Hard Guardrails live together.

Execution flow (who holds which key)
```
(1) Executor Agent(OpenClaw) : only emits a signal like "BUY 0.05 USDC". holds no key
(2) IntentOS adapter         : quotes / simulates and assembles a typed ExecutionRequest
(3) SessionKey(KMS)          : only "signs" the digest of that ExecutionRequest
                               └─ a key that cannot move funds. stays at 0 ETH. does not broadcast
(4) Relayer                  : prepared by the Platform (us, the IntentOS provider). relays the
                               signature and request to the ExecutionContract (temporarily fronts gas)
(5) ExecutionContract        : checks the signature and request against Hard Guardrails ->
                               execute if inside / revert if outside
```

So on-behalf execution is split across 3 layers:
1. The head (OpenClaw / LLM) only thinks about "what it wants to do", with zero onchain authority.
2. The SessionKey can sign an ExecutionRequest, but this is not a "key that moves funds", it is a "key
   that requests execution". It cannot freely send the Owner's funds; all it can do is issue a request
   to the ExecutionContract.
3. The ExecutionContract (= code inside the Owner account) mechanically decides whether that request
   is inside the Hard Guardrails (token pair / amount cap / slippage / expiry / freeze, etc.) and
   moves the Owner's funds only when it is inside.

So rather than "the Agent holds custody", the Agent can only issue a constrained "execution request"
against the Owner account. Funds are always the Owner's, and the contract's guard is the final stopcock.
A request that exceeds the cap is not silently swallowed by the adapter; the contract reverts with
AmountTooLarge, and that rejection reason is returned to the LLM so it re-requests inside the boundary.

### How do we get someone else to pay the gas and submit the transaction?

Here the Relayer built by the Platform (us, the IntentOS builders) is the lead. The point is to
separate "the one who signs (SessionKey)" from "the one who sends the tx and pays gas (Relayer)".

```
[pre]   Owner EOA contract : fundGasVault() prefunds ETH            [Owner ETH -> vault lane]
                             adds gas budget to gasVaultBalance
        v
SessionKey(KMS)  : signs the digest (r) -> sig                      [0 ETH]
        | passes (r, sig) to the Relayer via the adapter
        v
Relayer(Platform): sends writeContract(submitExecutionRequest, [r, sig])
                   pays the tx gas up front with its own ETH        [ETH down]
        v
Owner EOA contract : (1) verify signature + check Guardrails
                     (2) transfer the Owner's USDC                  [USDC down]
                     (3) measure real gas: spent = usedGas * tx.gasprice
                     (4) clamp by gasCap: spent = min(spent, gasPerTxCap)
                     (5) check vault: spent <= gasVaultBalance      [revert if depleted]
                     (6) settle from the ExecutionGasVault lane
                         gasVaultBalance -= spent
                         address(this)(=Owner ETH) -> Relayer       [vault lane down]
        v
Relayer(Platform): the advance is repaid                            [ETH mostly recovered]

  * the vault in (6) is not a separate account; it is a lane where the delegated account code
    manages address(this)==Owner EOA's ETH under a gasVaultBalance ledger
  * the Executor lane and the Watcher lane are separate gasVaultBalance
  * any clamp overflow (spent > gasPerTxCap) is covered by the Platform on a trust basis
```

## 1. From Intent to a Living Agent NFT

The end-to-end flow has this shape.
```
Intent
  -> Agent Package
  -> Agent NFT (mint)
  -> OpenClaw Runtime
  -> Guarded Execution
       Hard Guard:     EIP-7702 ExecutionContract
       Semantic Guard: Watcher Agent (optional)
```

1. Login and proof of personhood. The Owner connects a wallet and proves personhood with World ID. We
   do not use World Chain, but because we stand up a real Runtime on Cloud Run for each Agent, if a
   wallet alone could be used without limit, bots / sybils would mass-produce Runtimes and the
   operator's compute / model / indexing cost would collapse. So proof of personhood is the gate
   before Runtime creation.
2. Speak the Intent. The Owner tells the IntentBuilder what they want to do. What is written here is
   not contract arguments, but what they want their funds to do, with the purpose and the acceptable
   range.
   ```
   "I want to swap USDC into ETH little by little"
   "Stop on large price swings"
   "Avoid unnatural routes and stale quotes"
   "Fall back to the stable asset on failure"
   ```
3. The Agent Package is generated. The IntentBuilder turns the conversation into an Agent Package that
   can be injected into the OpenClaw Runtime. The screen shows the Agent's goal, behavior, the Hard
   Guardrails it must never cross, and the Semantic Guardrails the Watcher Agent reads after execution.
   - Hard Guardrails (target / selector / token pair / amount cap / slippage cap / expiry / nonce,
     etc.) are written into the EIP-7702 ExecutionContract and mechanically checked on every execution.
     If violated, the transaction does not pass.
   - Semantic Guardrails (unnaturalness of the route, freshness of the quote, adequacy of the
     simulation, soundness of the recovery path, etc.) are expectations the contract cannot read on
     the spot. They are the reading the Watcher Agent uses to judge by reading evidence after execution.
4. Mint the Executor Agent. Once the Owner confirms the content, the Executor Agent is minted as an
   Agent NFT. This is not "handing funds to an AI". What is minted is the Agent identity that executes
   the Intent, the usage right to run the Runtime, and the Agent Package manifest it must obey.
5. The Runtime comes up. The Runtime Registry looks at the NFT, provisions an OpenClaw Runtime on
   Cloud Run, and starts running the AgentLoop. What is handed to the Runtime is not a key that moves
   funds, but only the SessionKey for issuing ExecutionRequests to the ExecutionContract.
6. The Executor Agent runs. On each tick it reads market state / portfolio / current Hard Guardrails /
   Intent state and chooses BUY / SELL / HOLD / RECOVER. When needed it fetches a quote and route from
   Uniswap, runs a simulation, and leaves evidence. Only when it decides it should execute does it
   sign the ExecutionRequest with the SessionKey and submit it to the ExecutionContract.
7. The Hard Guard kicks in. The ExecutionContract does not trust the Agent's reasoning. It only looks
   at whether the submitted request is inside the Hard Guardrails. Inside means execute, outside means
   revert. That is the Hard Guard.
8. Evidence remains. When an execution passes, the onchain tx / event / quote / route / simulation /
   reasoning hash are carved into the timeline. On the Owner's screen, what the Executor Agent saw,
   what it chose, which request it issued, and which transaction passed are visible as an activity log.
9. Add the Watcher Agent. The Owner can add a Watcher Agent as a situation monitor. They have the
   IntentBuilder read the Executor Agent's Agent Package, generate a monitoring-only Watcher Agent
   Package, and mint it as a Watcher Agent NFT. The Watcher references the target Executor Agent's
   tokenId / intentId / packageHash / guardrail hash as immutable context. It does not access funds.
   What it holds is only the identity and Runtime usage right to observe, question, and report / vote.
10. The Semantic Guard kicks in. The Watcher Agent's Runtime also runs on OpenClaw. It reads contract
    events and evidence, questions the Executor Agent, and judges against the Semantic Guardrails
    whether execution was on-intent. If there is a problem, it issues a report / vote with its runtime
    key, and when quorum is reached the ExecutionContract's future execution range is tightened /
    frozen. That is the Semantic Guard. The Watcher Agent can only tighten; only the Owner can loosen.

In the end, what the Owner sees is not a single transaction, but one execution timeline where the
Agent NFT, the Runtime, the Hard Guard, and the Semantic Guard all move together. The Executor Agent
and the Watcher Agent watch the same timeline and confirm how far the Agent stayed inside the Intent.

## 2. Product Journey / Screen Definitions

The screens are organized around the Agent NFT being minted, the Runtime running, and Guarded
Execution being visible.

- Owner onboarding
  - The Owner visits the site
  - Connects a wallet
  - Proves personhood with World ID
  - World Chain is not used, but to prevent abuse / cost blow-up from mass-produced Cloud Run OpenClaw
    Runtimes, this proof is the gate to start using IntentOS
  - After login, enters the Intent List

- Intent List
  - Only 1 active Intent per Owner
  - If there is a running Intent, can return to the Runtime Dashboard
  - `Run a new Intent` is enabled only when there is no active Intent
  - Past Intents can be reviewed on the Result / Performance screen

- Intent Launch Dashboard
  - The card-grid dashboard entered first when choosing to run a new Intent
  - Not a final-check screen, but a navigation hub to each settings screen
  - cards:
    - Intent creation
    - Executor Agent creation / edit
    - Agent Identity
    - Human Proof
    - Gas Funding / Revoking
    - Runtime Preview
    - Watcher Agent Guard
    - Start Conditions
  - When the required cards are complete, `Start trading` is enabled
  - Watcher Agent Guard can be skipped as an optional card

- Intent creation
  - Create a Natural Intent using the IntentBuilder
  - The IntentBuilder generates the Agent Package
  - The Owner reviews the Intent Summary / Hard Guardrails / Semantic Guardrails
  - For a new one, mint the Executor Agent NFT
  - Bind the manifest hash of the Agent Package the Owner reviewed to the Agent NFT
  - Register the Hard Guardrails from `CONSTRAINTS.json` into the ExecutionContract / ExecutionGasVault

- Agent identity setup
  - The Executor Agent NFT's tokenId is finalized
  - Create `agent-<tokenId>.intentos.base.eth`
  - Set ENSIP-26 `agent-context` / `agent-endpoint[web]`
  - Set ENSIP-25 `agent-registration[registry][agentId]`
  - Put the ENS name into the ERC-8004 registration / tokenURI

- Runtime / fund preparation
  - The Runtime Registry confirms the Executor Agent NFT's owner
  - Create or reuse an ExecutorRuntime Capsule
  - Review Runtime budget / gas budget / estimated cost / refund policy / stop condition
  - Fund the ExecutionGasVault inside the Owner's delegated account

- Watcher Agent creation
  - If needed, the Owner hands the Executor Agent's Agent Package to the IntentBuilder
  - The IntentBuilder generates a monitoring-only Watcher Agent Package
  - The Owner confirms the Executor Agent tokenId / intentId / package hash / guardrail hash that the
    Watcher Agent package references
  - Mint the Watcher Agent NFT
  - Create `watcher-<tokenId>.intentos.base.eth`
  - Put the ENS name into the Watcher Agent registration / tokenURI
  - Set the Watcher Agent quorum condition
  - Create or reuse a WatcherRuntime Capsule
  - Fund the Owner-funded Watcher ExecutionGasVault with a gas budget

- Start
  - Can start only when the required conditions on the Launch Dashboard are met
  - To start without a Watcher Agent, start with Executor Agent + Hard Guardrails only
  - To attach a Watcher Agent, can start only after quorum set and gas budget are ready
  - The Executor Agent, and the Watcher Agent if present, begin operating inside the AgentLoop

- Owner Runtime Dashboard
  - View the Executor Agent's activity log
  - View the current Agent Package / Hard Guardrails / ExecutionGasVault balance
  - View the quote / simulation / ExecutionRequest / tx result / evidence timeline
  - Perform Owner stop / fund top-up / Watcher Agent configuration review

- Watcher Agent Runtime Dashboard
  - View the Watcher Agent's activity log
  - Read Base's EvidenceCommitted events / 200-char reason / hashes
  - Judge execution against the Semantic Guardrails and the Watcher Agent package
  - View the conversation with the Executor Agent if needed
  - Review report / vote / freeze / tighten candidates
  - Submit onchain report / vote tx with the Watcher Agent runtime key

- Shared execution timeline
  - Executor Agent decision
  - quote / route / simulation
  - ExecutionRequest
  - EvidenceCommitted event
  - 200-char reason
  - onchain tx / event
  - evidence hash
  - Watcher Agent review
  - report / vote
  - contract state update

- Result / Performance screen
  - running
  - tightened
  - frozen
  - self-stopped
  - owner-stopped
  - fund-exhausted
  - transferred / revoked
  - In the final state, show the stop reason, tx hash, final Hard Guardrails, remaining ExecutionGasVault
    fund, and refund
  - As performance, show the target-currency value in USDC before start, the target-currency value in
    USDC after, net delta, token balance delta, and gas / runtime cost

## 3. From Intent to Execution on the Runtime (with how the guardrails work)

This section describes, in one continuous line, how the Owner's Natural Intent becomes an Agent
Package, is injected into a Runtime Capsule, and is executed onchain under both Hard and Semantic
guardrails.

### 3.1 The role and authority boundary of the OpenClaw Runtime

OpenClaw is the head and the work surface of the Agent: an always-on orchestration layer that reads
the Agent Package and runs the AgentLoop. Its role is limited to orchestrating bounded onchain
interaction, and both the Executor Agent and the Watcher Agent run on this OpenClaw Runtime.

What OpenClaw can and cannot do is clearly separated.
- Can: observe, think, and call permitted IntentOS typed tools, per the Agent Package.
- Cannot: hold onchain authority, or move funds. Even if OpenClaw decides it "wants to", that alone
  moves no funds.
- The final authority over fund movement remains not with OpenClaw, but with the IntentOS adapter and
  the EIP-7702 ExecutionContract / Hard Guardrails.

The principle is: **requests flow from the upper layers down, but authority stays in the Chain layer.**
Even if the upper layers (LLM / adapter / SessionKey) are compromised, the lower layers
(ExecutionContract and Hard Guardrails) protect the funds.

So the whole thing is a one-directional pipeline: the IntentBuilder generates an Agent Package from a
Natural Intent, the Runtime Registry injects it into the OpenClaw Runtime, OpenClaw runs the AgentLoop
and calls IntentOS typed tools, and the ExecutionContract checks against the Hard Guardrails and
executes.

```text
Natural Intent
  -> IntentBuilder
  -> Agent Package
  -> OpenClaw Runtime
  -> IntentOS typed tools
  -> EIP-7702 ExecutionContract
  -> Bounded Onchain Execution
```

### 3.2 Generating the Agent Package

The IntentBuilder generates, from the Owner's Natural Intent, the Agent Package to inject into the
OpenClaw Runtime.

This Agent Package is a set of config files bundling the AI Agent's behavior, values, tools, memory,
evidence, stop conditions, and onchain constraints.
- The Agent NFT holds this Agent Package's manifest hash.
- The Runtime Registry looks up the Agent Package by tokenId and injects it into the OpenClaw Runtime
  Capsule.
- An Owner-created Watcher Agent package is not a reuse of the Executor Agent package, but a separate
  package with a monitoring-only role / tools / stop policy.
- However, it includes the target Executor Agent's tokenId, intentId, executorPackageHash, Hard
  Guardrails, and Semantic Guardrails as immutable context.

```text
agent-package/
  manifest.json
  SUMMARY.md
  AGENTS.md
  SOUL.md
  TOOLS.md
  MEMORY.md
  EVIDENCE.md
  STOP.md
  CONSTRAINTS.json
```

`manifest.json` holds the parent hash of the whole package.
The Agent NFT, the Runtime Registry, and the evidence timeline reference this hash.

```json
{
  "packageVersion": "0.1",
  "agentRole": "EXECUTOR",
  "agentTokenId": "123",
  "intentId": "intent-abc",
  "packageHash": "0x...",
  "files": {
    "SUMMARY.md": "0x...",
    "AGENTS.md": "0x...",
    "SOUL.md": "0x...",
    "TOOLS.md": "0x...",
    "MEMORY.md": "0x...",
    "EVIDENCE.md": "0x...",
    "STOP.md": "0x...",
    "CONSTRAINTS.json": "0x..."
  }
}
```

### 3.3 Agent Package file layout

| File | Purpose |
| --- | --- |
| `SUMMARY.md` | A short intent summary for the Owner |
| `AGENTS.md` | OpenClaw's system prompt / role / goal / allowed actions / never rules / default behavior |
| `SOUL.md` | risk posture / priority / default instinct / recovery preference |
| `TOOLS.md` | Description and usage of the tools OpenClaw can see |
| `MEMORY.md` | What to store and not store in working memory |
| `EVIDENCE.md` | Per-tick evidence and hash commitment. The evidence contract the Watcher Agent reads |
| `STOP.md` | OpenClaw's stop / hold / self-stop conditions |
| `CONSTRAINTS.json` | The Hard Guardrails info to register into the EIP-7702 ExecutionContract |
| `OpenClaw config / IntentOS plugin` | The actual tool allowlist enforcement |

`TOOLS.md` is a description for the Agent, not the enforcement itself.
The actual tool allowlist is enforced by the OpenClaw config, the IntentOS plugin, the Runtime
adapter, and the ExecutionContract.

### 3.4 How the guardrails work

Hard Guardrails are constraints the EIP-7702 ExecutionContract enforces synchronously.
They include target, selector, token pair, amount cap, spender cap, slippage cap, expiry, freeze
state, nonce, etc.
As contract state, they reduce to typed hard guard state.

Semantic Guardrails are expectations the contract cannot read on the spot.
They include route freshness, risk posture, simulation adequacy, recovery preference, unnatural route
avoidance, etc.
The Watcher Agent reads evidence after execution and reports / votes against these Semantic Guardrails.

The same "staleness" is stopped by different layers: expiry is mechanically judged by the Hard Guard,
while quote freshness is semantically judged by the Semantic Guard.
  -> OpenClaw Runtime Instructions
  -> Tool Policy
  -> Memory Policy
  -> Evidence Policy
  -> Stop Policy
  -> Hard Guardrails
  -> Semantic Guardrails

Hard Guardrails
  -> EIP-7702 ExecutionContract

Semantic Guardrails
  -> Optional Watcher Agent Semantic Guard
```

### 3.5 Runtime Registry and Runtime Capsule

The Runtime is the always-on execution environment that runs the AgentLoop.
- In the IntentOS MVP, an OpenClaw Runtime Capsule is created on a Cloud Run Service for each Agent NFT.
- The Runtime Registry is the Backend source of truth that manages the mapping between Agent NFTs and
  Runtime Capsules.

```text
RuntimeRecord:
  tokenId
  runtimeId
  runtimeOwner
  bindingNonce
  runtimeStatus
  cloudRunService
  runtimeManifestHash
  kmsKeyRef
  executionGasVaultRef
  lastHeartbeatAt
```

When a Runtime start request comes in, the Runtime Registry compares `ownerOf(tokenId)` with
`runtimeOwner`.

```text
runtime does not exist:
  -> create a new Runtime Capsule

runtimeOwner == ownerOf(tokenId):
  -> reuse the existing Runtime Capsule

runtimeOwner != ownerOf(tokenId):
  -> the old Runtime Binding is invalid
  -> reject the old Runtime's authority-bearing operations
  -> the new owner creates a new Runtime Binding
```

A Runtime-specific SessionKey is handed to the Runtime Capsule.
- The SessionKey is not a key that freely moves the Owner's funds.
- It is a request capability for issuing ExecutionRequests to the ExecutionContract.
- The SessionKey / IntentOS tool adapter / ExecutionGasVault / ExecutionContract / Watcher vote
  contract all confirm that the Runtime Binding is tied to the current owner.
- So even if an old Runtime keeps running autonomously, it cannot do any meaningful onchain
  interaction after a transfer.

### 3.6 Runtime Injection (loading the Agent Package into OpenClaw context)

OpenClaw is a runtime that injects workspace files into the system prompt / project context. What
OpenClaw natively reads is mainly `AGENTS.md` / `SOUL.md` / `TOOLS.md`, and the rest of the Agent
Package files (`SUMMARY` / `MEMORY` / `EVIDENCE` / `STOP` / `CONSTRAINTS`) must be loaded into the
runtime context by IntentOS.

Consider the injection method in two stages.
- MVP: the Runtime Registry materializes the Agent Package into the workspace and embeds the summary
  and file path of `SUMMARY` / `MEMORY` / `EVIDENCE` / `STOP` / `CONSTRAINTS` into `AGENTS.md`.
- Better: an IntentOS OpenClaw plugin injects the entire Agent Package via a before_prompt_build hook.

On spawn / resume, the Runtime Registry confirms `ownerOf(tokenId)` and the Owner's Web3 login / World
ID proof, fetches the Agent Package, and verifies the packageHash before starting the Runtime Capsule.
The ExecutorRuntime and the WatcherRuntime may use the same OpenClaw image, but their workspace /
agent id / session store / tool policy / gas vault lane are separated.

### 3.7 ExecutionGasVault and post-settlement of gas

The ExecutionGasVault is not a standalone gas sponsor.
- It is a gas reimbursement lane placed inside the Owner's EIP-7702 delegated account code.
- The Runtime / relayer pays the transaction gas first, and settles afterwards from the
  ExecutionGasVault inside the delegated account.

```text
Owner EOA delegated account:
  ExecutionContract
  Hard Guardrails
  Executor ExecutionGasVault
  Watcher ExecutionGasVault
```

The Executor Agent's gas budget is funded by the Owner.
So it is placed inside the Owner's delegated account, making clear it is under the Owner's control.

The Watcher Agent's gas budget is also funded by the Owner.
But it is placed in a separate lane from the Executor Agent's execution budget, making clear the
Watcher Agent never touches execution funds or execution capability.

```text
Runtime substrate:
  Cloud Run Service

Runtime unit:
  1 Executor Agent NFT / 1 ExecutorRuntime Capsule
  1 Watcher Agent NFT / 1 WatcherRuntime Capsule

Runtime access:
  Web3 wallet login + World ID proof required
  the number of active Agent NFTs per user can be limited by policy
```

World ID is a human proof gate; it does not mean using World Chain.
If bots / sybils mass-produced real OpenClaw Runtime Capsules on Cloud Run, the operator's compute /
model / indexer cost would collapse, so the World ID proof is the abuse gate before Runtime creation.

---

## 4. Execution Flow

The Executor Agent reads the Agent Package and keeps ticking on the OpenClaw Runtime.
The Executor Agent is not a free trader, but a signal executor that can only choose predefined actions.

```text
Predefined Executor actions:
  HOLD
  ASK_WATCHER
  GET_UNISWAP_QUOTE
  PROPOSE_SWAP
  REQUEST_SIMULATION
  SUBMIT_EXECUTION_REQUEST
  SELF_STOP
```

The Executor Agent's loop proceeds along this line.

```text
Perceive
  read market state / portfolio / current Hard Guardrails / Intent state
   ↓
Decide
  choose BUY / SELL / HOLD / RECOVER
   ↓
Quote
  fetch route / quote from the Uniswap ToolAdapter
   ↓
Simulate
  verify route / calldata / expected result
   ↓
Request
  call the IntentOS typed execution tool
   ↓
Submit
  the IntentOS adapter builds / signs / submits the ExecutionRequest
   ↓
Hard Guard
  the EIP-7702 ExecutionContract checks against the Hard Guardrails
   ↓
Execute / Revert
  execute if inside, revert if outside
   ↓
Record
  carve an EvidenceCommitted event into Base
  store reasoningHash / quoteHash / routeHash / simulationHash / tx hash / 200-char reason
```

Even during this loop, no onchain authority is given to OpenClaw (3.1). OpenClaw only calls IntentOS
typed tools; the final authority is held by the IntentOS adapter and the ExecutionContract.

On every execution, the Executor Agent carves an EvidenceCommitment onto Base.
The Watcher Agent's audit origin is not an offchain log, but this onchain commitment.

```solidity
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
```

`reason` is non-compressed English ASCII text, max 200 chars.
Do not include secrets, raw API responses, personal data, or markdown.
The offchain evidence/log body is reserved only as a future-extension slot, and is not required on
this protocol path.

Keep the ExecutorRuntime tool allowlist small.

```text
ExecutorRuntime tools:
  intentos.observe_state
  intentos.get_quote
  intentos.propose_swap
  intentos.simulate
  intentos.submit_execution_request
  intentos.record_evidence
  intentos.ask_watcher
  intentos.self_stop
```

`intentos.*` are the logical tool names shown to OpenClaw; the actual implementations bind to the
concrete surfaces held by the IntentOS Runtime adapter.

```text
Concrete tool surfaces:
  Uniswap Quote API
  Uniswap Swap API
  onchain read
  simulation provider
  EIP-7702 transaction submitter
  Executor Agent <-> Watcher Agent chat
```

`intentos.submit_execution_request` is not an arbitrary calldata submitter. It is a typed tool that
validates the args, binds the quote / simulation / evidence hash, assembles a typed ExecutionRequest,
signs it with the SessionKey / KMS, and sends it to the EIP-7702 delegated account.

The authority not given to OpenClaw is fixed explicitly.

```text
Not given to OpenClaw:
  arbitrary shell
  arbitrary URL fetch
  arbitrary contract call
  arbitrary calldata generation
  private key export
  policy loosen
  delegate contract change
  ExecutionGasVault replacement
```


---

## 5. Semantic Guard Flow

The Watcher Agent is a Semantic Guard added when the Owner needs a stronger guard.
IntentOS can start with the Executor Agent alone.
The Owner may start with Hard Guardrails only.
For high-value / long-running / complex intents, a Watcher Agent quorum can be layered on.

The Watcher Agent is minted as a Watcher Agent NFT that the Owner generates with the IntentBuilder.
The IntentBuilder references the already-fixed Executor Agent Package and creates a
monitoring-only Watcher Agent Package.
The Watcher Agent package holds `watchedExecutorTokenId`, `watchedIntentId`, `executorPackageHash`,
`hardGuardrailsHash`, `semanticGuardrailsHash` as immutable context.

The Watcher Agent is not a third-party auditor marketplace.
It is an Owner-created semantic circuit breaker.
It is also not an Executor co-pilot.
The Watcher Agent triggers no execution and has no Fund access.

```text
Predefined Watcher actions:
  OBSERVE_EXECUTION
  READ_EVIDENCE
  ASK_EXECUTOR
  JUDGE_ON_INTENT
  REPORT_OK
  REPORT_SUSPICIOUS
  VOTE_TIGHTEN
  VOTE_FREEZE
  SELF_STOP
```

The Watcher Agent's loop proceeds along this line.

```text
Observe
  read Base's EvidenceCommitted / tx / contract events
   ↓
Question
  if needed, ask the Executor Agent for an explanation
   ↓
Judge
  judge action / hashes / 200-char reason against the Semantic Guardrails and the Watcher Agent package
   ↓
Report / Vote
  submit an onchain report / vote tx with the Watcher Agent runtime key
   ↓
Quorum
  when quorum is reached, the ExecutionContract state is updated
   ↓
Tighten / Freeze
  narrow the future capability, or freeze
```

The Watcher Agent can only update in the tightening direction.
It does not increase caps.
It does not extend expiry.
It does not unfreeze.
Only the Owner can loosen / expand.

```text
WatcherRuntime tools:
  onchain read
  evidence read
  Executor Agent <-> Watcher Agent chat
  report / vote submit
```

A third-party Watcher marketplace, attention fees, correctness bonds, and slashing are not included in
the protocol core.
Even if connected in the future, the core invariants stay as: "the Watcher Agent only acts in the
tightening direction", "it has no fund access", and "only the Owner can loosen".

---

## 6. MVP Scope (Executor + single Watcher)

The MVP is built straight to its destination.

> From the Owner's Natural Intent, the Executor Agent guarded-executes USDC<->WETH on Base mainnet
> inside the Hard Guardrails, and a single Watcher Agent reads that evidence and tightens / freezes —
> all carried through as one execution timeline.

### 6.1 Deployment shape (Base mainnet + Cloud Run)

The MVP runs on Base mainnet and Cloud Run / GCP. The only thing running on the Owner's local PC is
the browser.

```text
Local (browser):
  Frontend dApp (onboarding / IntentBuilder UI / Owner dashboard)
  Owner Wallet (signing for EIP-7702 authorization / mint / funding)
  World ID proof of personhood (IDKit widget + World App)

Cloud Run / GCP:
  Runtime Registry / Backend
  ExecutorRuntime Capsule (OpenClaw)
  WatcherRuntime Capsule (OpenClaw)
  SessionKey (GCP KMS)
  Relayer / sponsor (gas advance)
  simulation provider / indexer

Base mainnet (onchain):
  EIP-7702 delegated account
  ExecutionContract / Hard Guardrails
  Executor / Watcher ExecutionGasVault
  EvidenceCommitted events
  Uniswap (USDC<->WETH)
```

Compute load, keys, Agent runtime, and relayer are all on the Cloud Run / GCP side, so it does not
stop even if the PC sleeps. The only key left local is the Owner's own wallet, and the funds stay
there too.

### 6.2 What the MVP includes

The Executor side carries the whole vertical slice.

```text
World ID gate
  -> Natural Intent -> Executor Agent Package via the IntentBuilder
  -> Executor Agent NFT mint + ENS/Basename + ERC-8004 registration
  -> set ExecutionContract / Hard Guardrails / ExecutionGasVault into the EIP-7702 delegated account
  -> Cloud Run ExecutorRuntime + SessionKey(KMS)
  -> observe -> get_quote(Uniswap) -> simulate -> submit_execution_request
  -> Hard Guard check -> execute / revert
  -> carve EvidenceCommitted onto Base
  -> Relayer advance + ExecutionGasVault post-settlement
```

The Watcher side takes the shortest path with a single Agent and quorum=1.

```text
Mint 1 Watcher Agent NFT (references the Executor package as immutable context)
  -> Cloud Run WatcherRuntime + SessionKey(KMS)
  -> read EvidenceCommitted
  -> judge on-intent against the Semantic Guardrails
  -> with quorum=1, a single vote reflects tighten / freeze immediately into state
  -> the ExecutionContract's future capability tightens, and the next Executor request reverts
```

The Owner dashboard shows Executor decision / evidence / Watcher vote / contract state / final Result
as one shared timeline, and provides Owner stop and gas top-up.

The fixed parameters are:
- The trading pair is fixed to USDC<->WETH.
- The Watcher is fixed to 1 agent, with quorum=1 (1 vote = immediate tighten / freeze).

### 6.3 What the MVP does not do (scope boundary)

```text
multiple Watcher quorum / a polished Watcher-only operator console
arbitrary DEX routing / tokens other than USDC<->WETH / arbitrary contract calls
LLM directly generating calldata / LLM loosening policy
fund custody on the Agent wallet / native ETH holdings
mixing the Executor execution budget with the Watcher monitoring budget
third-party watcher marketplace / reward / bond / slashing
multiple simultaneous active intents per Owner
real connection of the Reputation Registry / Validation Registry
```

---


### X. Agent NFT Model

In IntentOS, both the Executor Agent and the Watcher Agent exist as ERC721 / ERC-8004-compatible Agent
NFTs.

- What the Agent NFT represents is the Agent's identity and Runtime usage right. This is transferable.
  However, what moves on transfer is only the identity and the usage right; the Owner's fund custody
  does not move.
- The Runtime Binding is non-transferable. The Runtime does not move together with the NFT; the new
  owner creates a new Runtime Binding themselves. There is no need to synchronously stop the old
  Runtime, because the moment of transfer makes the old Runtime Binding structurally meaningless.
  Since all authority-bearing operations require ownerOf(tokenId) == runtimeOwner, after transfer the
  old Runtime cannot pass any of execution request / gas reimbursement / watcher vote, and self-stops
  at the next stop check.
- The Agent NFT's tokenURI points to an ERC-8004-compatible Agent Registration JSON. This registration
  publishes, in an externally discoverable form, the Agent's role / capability / Agent Package /
  Runtime / evidence / route back into IntentOS. The Reputation Registry / Validation Registry are
  left connectable later; first we establish the Agent identity registration.
- The Agent's ENS / Basename is assigned after minting the NFT and before creating the Runtime Binding.
  Once the tokenId is finalized, we create agent-<tokenId>.intentos.base.eth or
  watcher-<tokenId>.intentos.base.eth, and link ENSIP-26 text records with the ERC-8004 registration.
  By naming it before Runtime or gas funding, the Runtime / evidence / dashboard / Watcher Agent can
  all reference the same permanent name.

```
Agent identity setup:
  Agent NFT mint
  tokenId finalized
  generate ERC-8004 registration JSON
  assign ENS / Basename subname
  set agent-context / agent-endpoint[web]
  set agent-registration[registry][agentId]
  put the ENS name into the tokenURI / registration
  create Runtime Binding
```
```
{
  "schema": "erc8004-agent-registration",
  "schemaVersion": "0.1",
  "name": "IntentOS Executor Agent #123",
  "role": "EXECUTOR_AGENT",
  "description": "Executes an Owner Intent through EIP-7702 Hard Guardrails.",
  "agentPackageHash": "0x...",
  "runtimeManifestHash": "0x...",
  "services": [
    {
      "name": "guarded-execution",
      "capabilities": [
        "observe_state",
        "get_quote",
        "simulate",
        "submit_execution_request"
      ],
      "endpoint": {
        "status": "private",
        "description": "Runtime access requires current Agent NFT ownership through IntentOS Runtime Registry."
      }
    }
  ],
  "publicEndpoints": {
    "app": "https://intentos.arkt.me/",
    "profile": "https://intentos.arkt.me/",
    "onboarding": "https://intentos.arkt.me/",
    "capabilities": {
      "status": "planned"
    },
    "evidence": {
      "status": "planned"
    }
  },
  "ownership": {
    "transferable": true,
    "ownerCan": [
      "connect_wallet",
      "spawn_or_resume_runtime",
      "bind_new_intent",
      "fund_execution_gas_vault",
      "view_agent_logs"
    ],
    "transferDoesNotTransfer": [
      "previous_owner_funds",
      "previous_runtime_capsule",
      "previous_session_keys",
      "previous_execution_gas_vault_balance"
    ]
  },
  "supportedTrust": [
    "hard-guarded-execution",
    "optional-semantic-guard",
    "evidence-logging"
  ],
  "registries": {
    "reputation": { "status": "planned" },
    "validation": { "status": "planned" }
  }
}
```


---
