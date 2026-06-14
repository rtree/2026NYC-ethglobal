# IntentOS — Local Activation Kit (EIP-7702)

Delegate **your own EOA** to the IntentOS guard on **Base mainnet**, locally and non-custodially.

## Why a local kit?

Browser wallets (MetaMask) **refuse to sign an EIP-7702 authorization for a dApp-chosen contract** —
they only 7702-delegate to their own smart-account implementation (you'll see
`Account type "json-rpc" is not supported`). The authorization must therefore be signed by a **local
account or a hardware wallet**. This kit does that, and nothing else:

1. Loads your signer (**Ledger — recommended**, or an imported mnemonic / private key).
2. Waits until that EOA holds a little Base ETH.
3. Signs + broadcasts **one** EIP-7702 transaction that delegates your EOA to
   `ExecutionDelegate7702` (`0x37d9933c5ac95399c840d3a2c07fdfdbc8b7f9c1`) and initializes your Hard
   Guardrails (caps, the platform SessionKey + relayer, a tiny gas-vault reserve).

Your funds never leave your account. Your key never leaves this machine. We only ever learn your
**address** (when you later sign in to the panel with the same EOA).

## Run it (interactive)

Just run it — the kit walks you through everything:

```bash
node activate.mjs
```

It asks how you want to sign:

```
How do you want to sign the activation?
  [1] Ledger hardware wallet   (recommended — key never leaves the device)
  [2] Paste a private key / mnemonic   (hidden input; saved to .env for this run, then deleted)
Choose [1/2]:
```

- **[1] Ledger** — recommended for real funds; the key never leaves the device (see below).
- **[2] Paste** — your key is typed **hidden** (not echoed, not in shell history), saved to a local
  `.env` (chmod 600) just for this run, and **deleted automatically** when the kit finishes or you
  Ctrl-C. Use a **dedicated, low-value EOA** — never your main wallet's seed phrase.

Then the kit shows your EOA address and tells you to **deposit the funds you'll trade with** into it.
If the EOA you imported already holds a little Base ETH, it proceeds immediately.

## Requirements

- **Node.js 18+** (`node --version`). The distributed `activate.mjs` is **install-free** — `viem` is
  bundled in. Just run it.
- Your EOA needs the **funds you'll trade with** on Base, plus a little ETH for gas. An existing,
  already-funded wallet works — you don't have to fund a brand-new address.

## Recommended: Ledger (hardware)

For real funds, use a Ledger — the key never touches disk or RAM. Ledger uses native USB modules that
**cannot be bundled**, so install them once:

```bash
npm i @ledgerhq/hw-transport-node-hid @ledgerhq/hw-app-eth
node activate.mjs --ledger              # default HD path m/44'/60'/0'/0/0
node activate.mjs --ledger --hd-path "m/44'/60'/0'/0/3"
```

> Ledger support is **experimental**: it needs a Ledger Ethereum app recent enough to clear-sign
> EIP-7702. If yours doesn't, the kit tells you and you can fall back to a dedicated imported key.
> Verify on your physical device before trusting it with funds.

## Non-interactive (CI / power users)

The secret can also be supplied without the menu, from a **file** or **env var** (never echoed, never
in shell history). Use a DEDICATED, low-value EOA — never your main seed:

```bash
# key file
printf '%s' "your twelve word mnemonic here ..."  > key.txt   # or a 0x-private-key
node activate.mjs --key-file key.txt
rm -f key.txt

# env var
MNEMONIC="your twelve word mnemonic ..." node activate.mjs
PRIVATE_KEY=0xabc... node activate.mjs
```

## What you'll see

```
✔ Signer ready: 0xABCD…1234
→ Deposit the funds you'll use for trading into your EOA: 0xABCD…1234
    (needs a little Base ETH for gas; if this wallet already holds ETH you're set). Ctrl-C to abort.
✔ EOA has 0.01 ETH, 0.5 USDC — enough to activate.
→ Signing EIP-7702 authorization …
→ Broadcasting the activation transaction (delegate + initialize, one type-4 tx)…
→ tx: https://basescan.org/tx/0x…
✔ Activated. 0xABCD…1234 is now an IntentOS guarded account on Base mainnet.
→ Removed the temporary .env (key not left on disk).
```

## Flags

| Flag | Meaning |
|---|---|
| `--ledger` | Use a Ledger device (recommended). |
| `--hd-path <path>` | Ledger derivation path (default `m/44'/60'/0'/0/0`). |
| `--key-file <path>` | Read a mnemonic or `0x`-private-key from a file (skips the menu). |
| `--rpc <url>` | Override the Base RPC (defaults to public Base RPCs). |
| `--force` | Overwrite an existing delegation (e.g. a MetaMask Smart Account) on this EOA. |
| `--keep-env` | Don't delete the temporary `.env` at the end (so re-runs reuse the key). |

## After activating

Open the IntentOS panel, **sign in with the same EOA**, build your Intent, and run a guarded trade.
Executions are signed by the platform SessionKey and paid by the relayer, **reimbursed from your own
gas vault** — no further signatures from you.

## Build (for maintainers)

```bash
cd scripts/activate-kit
pnpm i
pnpm bundle      # -> dist/activate.mjs (install-free, viem inlined); also published to app/public/activate-kit/
```
