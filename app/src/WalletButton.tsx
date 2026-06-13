import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortAddr, addrUrl } from "./format";

// A wallet button that lists every discovered connector (EIP-6963 + injected fallback) so the user
// can pick MetaMask / Coinbase / etc. explicitly. Surfaces connect errors instead of failing silently.
export function WalletButton({ block }: { block?: boolean }) {
  const { address, isConnected } = useAccount();
  const { connectors, connect, error, isPending, variables } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);

  if (isConnected && address) {
    return (
      <>
        <a className="wallet-chip" href={addrUrl(address)} target="_blank" rel="noreferrer">
          <span className="dot" />
          {shortAddr(address)}
        </a>
        <button className="pill-link" onClick={() => disconnect()}>
          Disconnect
        </button>
      </>
    );
  }

  // De-dupe connectors by name (EIP-6963 can surface the generic injected alongside the named one).
  const seen = new Set<string>();
  const list = connectors.filter((c) => {
    const key = c.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button className={`btn primary ${block ? "block" : ""}`} onClick={() => setOpen((v) => !v)}>
        Connect Wallet
      </button>
      {open && (
        <div
          className="card"
          style={{ position: block ? "static" : "absolute", right: 0, marginTop: 8, zIndex: 50, minWidth: 240, padding: 12 }}
        >
          <p className="desc" style={{ marginBottom: 8 }}>Choose a wallet</p>
          {list.length === 0 && <p className="muted">No wallet detected. Install MetaMask.</p>}
          {list.map((c) => (
            <button
              key={c.uid}
              className="btn block"
              style={{ marginBottom: 8, justifyContent: "flex-start" }}
              disabled={isPending}
              onClick={() => {
                connect({ connector: c });
                setOpen(false);
              }}
            >
              {isPending && variables?.connector === c ? "…connecting" : c.name}
            </button>
          ))}
          {error && <p className="pill fund-exhausted" style={{ marginTop: 4 }}>{error.message.slice(0, 80)}</p>}
        </div>
      )}
    </div>
  );
}
