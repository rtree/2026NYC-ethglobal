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

## Requirements

- **Node.js 18+** (`node --version`). The distributed `activate.mjs` is **install-free** — `viem` is
  bundled in. Just run it.
- A small amount of **Base ETH** on the EOA you activate: **~0.002 ETH** (gas + a `0.0006 ETH`
  gas-vault reserve). Optionally **~0.001 USDC** for your first guarded trade.

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

## Fallback: imported key (use a DEDICATED, low-value EOA — never your main seed)

The secret is read from a **file** or **env var** so it is never echoed or saved in shell history:

```bash
# Option A — key file (recommended for the fallback path)
printf '%s' "your twelve word mnemonic here ..."  > key.txt   # or a 0x-private-key
node activate.mjs --key-file key.txt
rm -f key.txt

# Option B — env var
MNEMONIC="your twelve word mnemonic ..." node activate.mjs
PRIVATE_KEY=0xabc... node activate.mjs
```

If you provide nothing, the kit prompts interactively (input is visible — prefer `--key-file`).

## What you'll see

```
✔ Signer ready: 0xABCD…1234
→ Fund 0xABCD…1234 on Base mainnet:
    • 0.0012 ETH minimum (recommend ~0.002 ETH: gas + 0.0006 gas-vault reserve)
    • 0.001 USDC for your first guarded trade (optional now)
→ Waiting for ETH… (have 0, need 0.0012). Ctrl-C to abort.
✔ Funded: 0.002 ETH, 0.001 USDC
→ Signing EIP-7702 authorization …
→ Broadcasting the activation transaction (delegate + initialize, one type-4 tx)…
→ tx: https://basescan.org/tx/0x…
✔ Activated. 0xABCD…1234 is now an IntentOS guarded account on Base mainnet.
```

## Flags

| Flag | Meaning |
|---|---|
| `--ledger` | Use a Ledger device (recommended). |
| `--hd-path <path>` | Ledger derivation path (default `m/44'/60'/0'/0/0`). |
| `--key-file <path>` | Read a mnemonic or `0x`-private-key from a file. |
| `--rpc <url>` | Override the Base RPC (defaults to public Base RPCs). |
| `--force` | Overwrite an existing delegation (e.g. a MetaMask Smart Account) on this EOA. |

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
