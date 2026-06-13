import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage } from "wagmi";
import { shortAddr, addrUrl } from "./format";
import { authState, signInWithWallet, signOut } from "./auth";

// A wallet button that lists every discovered connector (EIP-6963 + injected fallback) so the user
// can pick MetaMask / Coinbase / etc. explicitly. Surfaces connect errors instead of failing silently.
// After connecting, it runs the SIWE -> Firebase sign-in handshake (plan/010 §17) so per-wallet data
// (drafts, history) is scoped to the signed-in address.
export function WalletButton({ block }: { block?: boolean }) {
  const { address, isConnected } = useAccount();
  const { connectors, connect, error, isPending, variables } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const [open, setOpen] = useState(false);
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [, forceRender] = useState(0);
  // Track which address we've already auto-attempted, so a failed sign-in doesn't loop signature popups.
  const attemptedFor = useRef<string | null>(null);

  // Re-render when the Firebase sign-in state changes (so the "Sign in" button updates).
  useEffect(() => {
    const onAuth = () => forceRender((n) => n + 1);
    window.addEventListener("intentos:auth", onAuth);
    return () => window.removeEventListener("intentos:auth", onAuth);
  }, []);

  function runSignIn(addr: `0x${string}`) {
    attemptedFor.current = addr;
    setSigning(true);
    setAuthErr(null);
    signInWithWallet(addr, signMessageAsync)
      .catch((e) => setAuthErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setSigning(false));
  }

  // Auto-run the SIWE handshake ONCE per connected address. Manual "Sign in" (below) retries on failure.
  useEffect(() => {
    if (!isConnected || !address || authState() || signing) return;
    if (attemptedFor.current === address) return; // already tried this address; wait for manual retry
    runSignIn(address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  if (isConnected && address) {
    const signedIn = !!authState();
    return (
      <>
        <a className="wallet-chip" href={addrUrl(address)} target="_blank" rel="noreferrer">
          <span className="dot" />
          {shortAddr(address)}
          {signing ? " · signing…" : ""}
        </a>
        {!signedIn && !signing && (
          <button className="btn primary" onClick={() => runSignIn(address)}>
            Sign in
          </button>
        )}
        <button className="pill-link" onClick={() => { signOut(); disconnect(); }}>
          Disconnect
        </button>
        {authErr && (
          <span className="pill fund-exhausted" style={{ marginLeft: 8 }} title={authErr}>
            sign-in failed
          </span>
        )}
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
