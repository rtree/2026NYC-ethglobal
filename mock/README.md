# IntentOS — Screen Mocks

Static HTML mockups of the IntentOS MVP screens. The only thing that runs on the Owner's local PC is
the browser, so these mocks double as the **frontend implementation target**.

- Vocabulary (status names, guardrail fields, tool names, event fields) is fixed in
  [../plan/010-interfaces.md](../plan/010-interfaces.md) (Seam Freeze). Mocks must not invent fields
  that are not in that doc.
- Product rationale: [../plan/000-northStar-en.md](../plan/000-northStar-en.md) (English) /
  [../plan/000-northStar.md](../plan/000-northStar.md) (Japanese, source of truth).
- Scope: MVP "B" — Executor full vertical slice + single Watcher (quorum=1), USDC<->WETH, Base mainnet.

## View

Open `index.html` in a browser (no build step, no server required):

```bash
xdg-open mock/index.html   # Linux
```

## Screens

| File | Screen |
| --- | --- |
| `index.html` | Navigation hub |
| `010-onboarding.html` | Wallet connect + World ID human-proof gate |
| `020-intent-list.html` | Active Intent + history |
| `030-launch-dashboard.html` | Card-grid navigation hub for one Intent |
| `040-intent-creation.html` | IntentBuilder chat + Agent Package preview + mint |
| `050-agent-identity.html` | tokenId / ENS / ERC-8004 registration |
| `060-runtime-funding.html` | Runtime Capsule + ExecutionGasVault funding |
| `070-watcher-creation.html` | Watcher Agent mint + immutable context + quorum |
| `080-start.html` | Launch preconditions + start |
| `090-owner-dashboard.html` | AgentLoop log + guardrails + shared execution timeline |
| `100-watcher-dashboard.html` | Evidence review + report / vote / tighten / freeze |
| `110-result.html` | Terminal state + performance |

These are visual/data mocks, not wired logic. Buttons and links navigate between screens only.
