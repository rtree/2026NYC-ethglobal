import { useAccount } from "wagmi";
import { WalletButton } from "./WalletButton";

export function TopBar({ status }: { status?: string }) {
  const { isConnected } = useAccount();

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
      <WalletButton />
      {!isConnected && null}
    </header>
  );
}

export function Nav() {
  const items: [string, string][] = [
    ["#/intents", "Intents"],
    ["#/launch", "Launch"],
    ["#/dashboard", "Owner"],
    ["#/watcher", "Watcher"],
    ["#/result", "Result"],
  ];
  const here = window.location.hash || "#/";
  return (
    <div className="steps" style={{ marginBottom: 0 }}>
      {items.map(([href, label]) => (
        <a key={href} className={`step ${here === href || here.startsWith(href + "/") ? "active" : ""}`} href={href}>
          {label}
        </a>
      ))}
    </div>
  );
}
