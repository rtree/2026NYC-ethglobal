# IntentOS — Journey Coverage & Test Matrix

Comprehensive audit of the North Star journey (000 §1 / §2) vs. implementation, with the test method
for every screen and transition — including the hard-to-test ones (Web3 login, World ID). Living doc;
update as gaps close.

Legend: ✅ done · ⚠️ partial · ❌ missing · 🤖 automated test · 🧑 human-required

## A. Journey steps (North Star §1)

| # | Step | Impl | Test method | Status |
| --- | --- | --- | --- | --- |
| 1 | Login + World ID human proof | ❌→⚠️ | 🤖 mock injected wallet; 🤖 World ID gate w/ mock verify; 🧑 real proof | building |
| 2 | Speak Intent (IntentBuilder) | ⚠️ scripted | 🤖 Playwright walks the chat | building |
| 3 | Agent Package generated (hashes, preview) | ⚠️ deterministic | 🤖 assert preview fields | building |
| 4 | Mint Executor Agent NFT | ✅ | 🤖 API + on-chain tokenId | done |
| 5 | Runtime starts | ⚠️ deterministic strategy (no live OpenClaw) | 🤖 ensureSetup tx | accepted |
| 6 | Executor runs: quote→(sim)→evidence | ⚠️ quote+submit (no autonomous loop) | 🤖 trade endpoint + EvidenceCommitted | done |
| 7 | Hard Guard works | ✅ | 🤖 AmountTooLarge / GuardIsFrozen reverts | done |
| 8 | Evidence recorded onchain | ✅ | 🤖 read EvidenceCommitted logs | done |
| 9 | Add Watcher Agent | ✅ | 🤖 API + on-chain tokenId | done |
| 10 | Semantic Guard: tighten/freeze | ✅ | 🤖 freeze→trade reverts; resume→trade ok | done |

## B. Screens (North Star §2) — every transition must be walkable

| # | Screen | Route | Impl | Transition test | Status |
| --- | --- | --- | --- | --- | --- |
| 010 | Onboarding (connect + World ID) | `#/` (gate) | ❌→building | 🤖 connect→gate→Intent List | building |
| 020 | Intent List | `#/intents` | ✅ | 🤖 active card→dashboard; new→launch | building |
| 030 | Launch Dashboard (8 cards) | `#/launch` | ⚠️→building | 🤖 each card→its screen; complete→Start | building |
| 040 | Intent creation | `#/launch/intent` | ⚠️ | 🤖 chat→preview→mint button | building |
| 050 | Agent identity | `#/launch/identity` | ❌→building | 🤖 tokenId, ENS name, ERC-8004 JSON shown | building |
| 060 | Runtime / funding | `#/launch/runtime` | ⚠️→building | 🤖 runtime record + vault + fund | building |
| 070 | Watcher creation | `#/launch/watcher` | ⚠️→building | 🤖 mint watcher + quorum | building |
| 080 | Start | `#/launch/start` | ❌→building | 🤖 preconditions→start→dashboard | building |
| 090 | Owner dashboard | `#/dashboard` | ✅ live | 🤖 trade button→tx; resume | building |
| 100 | Watcher dashboard | `#/watcher` | ✅ live | 🤖 freeze→state; tighten | building |
| 110 | Result | `#/result` | ✅ live | 🤖 terminal-state render | building |

## C. Test layers

1. **Contracts** (forge): 27 unit + fork — ✅ passing.
2. **API** (curl/script): full journey executor→watcher→trade→freeze→reject→resume — ✅ passing.
3. **UI e2e** (Playwright): inject `window.ethereum` mock → walk every route → assert render +
   transitions + button wiring. Read/nav paths fully automated; money actions (trade/freeze) run once
   live to confirm wiring, then asserted from state.
4. **World ID**: gate logic automated with a mock verify; real proof is 🧑 (needs World App).

## D. Human-required (will request explicitly)

- 🧑 Real wallet (MetaMask) connect + EIP-7702 authorization signature from the user's own wallet.
- 🧑 Real World ID proof via World App (QR scan).
- These are gated by design (private keys / personhood). Everything else is automated.
