# IntentOS — Task & Workflow

This file records **how we build**, so the plan survives across sessions and context resets.
The product target is defined in [plan/000-northStar.md](plan/000-northStar.md) (Japanese, source of truth)
and mirrored in [plan/000-northStar-en.md](plan/000-northStar-en.md) (English).

MVP scope is **B: Executor + single Watcher** (see North Star section 6):
Owner Natural Intent -> Executor Agent guarded-executes USDC<->WETH on Base mainnet inside
Hard Guardrails -> a single Watcher Agent reads the evidence and can only tighten / freeze.
Everything runs on Base mainnet + Cloud Run / GCP; the only thing on the Owner's local PC is the browser.

---

## Build Order: Seam Freeze -> Mock -> SDD

We do **not** write one big SDD up front. We freeze the shared interfaces first, then mock the
screens, then write the SDD per component. This keeps each task small enough to fit in one working
context and prevents the failure modes below.

```text
1. Seam Freeze (small, first)
     One file that fixes the shared vocabulary every later task depends on:
       - Result state machine (running / tightened / frozen / self-stopped /
         owner-stopped / fund-exhausted / transferred)
       - EvidenceCommitted event fields
       - Agent Package manifest.json shape
       - intentos.* typed tool list (Executor + Watcher)
       - RuntimeRecord / RuntimeBinding shape
       - Screen list (from North Star section 2)
     Almost nothing is newly invented; it is gathered from the North Star.

2. Mock (per screen)
     The screens are already enumerated in North Star section 2, so we draw them without
     inventing structure. Each screen pins down which state / which hash / which balance it
     shows. That becomes the data contract for the SDD. For a hackathon, the mock doubles as
     the implementation target.

3. SDD (per component)
     Written against the frozen interfaces (1) and the real screens (2), so it does not drift
     in types and does not over-design. One vertical slice only (B scope):
     contract -> runtime / relayer -> frontend.
```

### Why this order (LLM failure modes we are avoiding)

- **Writing the whole SDD at once** forces holding contracts + EIP-7702 + KMS + relayer + runtime +
  frontend in one context. Late in the context we forget early type definitions, so field names and
  state names **drift between sections**, and we **over-design** interfaces nobody uses yet.
- **Mocking before the data contract exists** lets each screen **invent its own fields**, which all
  has to be redone later.
- Freezing the **narrow waist (shared seam) first** means every later task reads only "the seam +
  its own component", so each unit of work stays small and consistent. The mock is also a
  *forcing function* that makes the data contract concrete before the SDD is written.

**Direct answer to "mock or SDD first": mock first, with a small Seam Freeze in front of it.**

---

## Conventions

- **Languages**: `plan/000-northStar.md` stays Japanese (team is mostly Japanese-only).
  Every other doc, mock, and file from now on is written in **English** (global hackathon).
  `plan/000-northStar-en.md` is the English mirror of the North Star.
- **File numbering**: plan files increment by **10** (`000-`, `010-`, `020-`, ...).
- **Git cadence**: pull, then commit and push to remote (origin) at every natural breakpoint —
  roughly every ~500 lines written or ~5 new files. Keep history small and frequent.

---

## Task Board

### Done
- North Star sections 0-6 + Agent NFT Model written (Japanese), cleanup pass applied.
- MVP scope fixed to B (Executor + single Watcher, quorum=1, USDC<->WETH, Base mainnet + Cloud Run).
- English mirror `plan/000-northStar-en.md` created.
- **Seam Freeze** -> `plan/010-interfaces.md` (English): types, EvidenceCommitted, manifest, intentos.*
  tools, RuntimeRecord/Binding, guardrail enforce order, terminal states, screen list.
- **Mocks** -> `mock/` (English): design system (`styles.css`), `index.html` hub, `README.md`, and
  11 screens `010-110`. Validated in browser: 0 console errors, all internal links resolve,
  responsive grid OK.

### Next
1. **SDD** (per component, English): contract -> runtime / relayer -> frontend, B-scope vertical slice.
   Anchor each component to its `010-interfaces.md` section + the matching `mock/` screen.
