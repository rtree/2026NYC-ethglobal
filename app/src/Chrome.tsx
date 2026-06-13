import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { shortAddr, addrUrl } from "./format";

export function TopBar({ status }: { status?: string }) {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  return (
    <header className="topbar">
      <a className="brand" href="#/" style={{ textDecoration: "none", color: "inherit" }}>
        <div className="logo">I</div>
        IntentOS <small>Base mainnet</small>
      </a>
      <div className="spacer" />
      {status && (
        <span className={`pill ${status}`}>
          <span className="dot" />
          {status}
        </span>
      )}
      {isConnected && address ? (
        <>
          <a className="wallet-chip" href={addrUrl(address)} target="_blank" rel="noreferrer">
            <span className="dot" />
            {shortAddr(address)}
          </a>
          <button className="pill-link" onClick={() => disconnect()}>
            Disconnect
          </button>
        </>
      ) : (
        <button className="btn primary" onClick={() => connect({ connector: injected() })}>
          Connect Wallet
        </button>
      )}
    </header>
  );
}

export function Nav() {
  const items: [string, string][] = [
    ["#/", "Intents"],
    ["#/launch", "Launch"],
    ["#/dashboard", "Owner"],
    ["#/watcher", "Watcher"],
    ["#/result", "Result"],
  ];
  const here = window.location.hash || "#/";
  return (
    <div className="steps" style={{ marginBottom: 0 }}>
      {items.map(([href, label]) => (
        <a key={href} className={`step ${here === href ? "active" : ""}`} href={href}>
          {label}
        </a>
      ))}
    </div>
  );
}
