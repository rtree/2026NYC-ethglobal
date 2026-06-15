import { useAccount } from "wagmi";
import { WalletButton } from "./WalletButton";
import { useGate, setWorldIdVerified } from "./gate";
import { worldIdRequiredCached } from "./auth";
import { api } from "./api";

export function TopBar({ status }: { status?: string }) {
  const { isConnected } = useAccount();
  const { verified, signedIn } = useGate();
  // Show a World ID chip + log-off only when the server enforces World ID and the user has passed it.
  const showWorldId = worldIdRequiredCached() && signedIn && verified;

  async function worldIdLogOff() {
    try {
      await api.worldIdReset(); // clears the server-side humanVerified + nullifier for this user
    } catch {
      /* still clear locally so the demo can re-run */
    }
    setWorldIdVerified(false);
    window.location.hash = "#/"; // back to the onboarding gate so the re-verify flow is visible
  }

  return (
    <header className="topbar">
      <a className="brand" href="#/" style={{ textDecoration: "none", color: "inherit" }}>
        <div className="logo">i</div>
        intentOS <small>Base mainnet</small>
      </a>
      <div className="spacer" />
      {status && (
        <span className={`pill ${status}`}>
          <span className="dot" />
          {status}
        </span>
      )}
      {showWorldId && (
        <>
          <span className="pill ok" title="Verified as a unique human with World ID">
            <span className="dot" />
            World ID
          </span>
          <button className="pill-link" onClick={worldIdLogOff} title="Reset your World ID verification and return to the gate">
            World ID log off
          </button>
        </>
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
    ["#/console", "Live Console"],
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
