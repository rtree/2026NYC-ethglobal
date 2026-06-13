import { TopBar } from "./Chrome";
import { WalletButton } from "./WalletButton";
import { useGate, setWorldIdVerified, WORLDID_APP_ID } from "./gate";

// 010 · Owner onboarding. Gates before entering: (1) connect a wallet, (2) sign in (Web3 -> Firebase),
// (3) World ID human-proof. World ID prevents bot/sybil mass-creation of Cloud Run runtimes (North Star
// §2). When VITE_WORLDID_APP_ID is unset, a clearly-labeled dev simulation stands in for IDKit.
export function Onboarding() {
  const { isConnected, verified, signedIn, authRequired, passed } = useGate();

  function enter() {
    window.location.hash = "#/intents";
  }

  return (
    <div className="app">
      <TopBar />
      <main className="main">
        <div className="page-head" style={{ marginTop: 30 }}>
          <div className="eyebrow">010 · Owner Onboarding</div>
          <h1>Enter IntentOS</h1>
          <p>
            Connect your wallet and sign in, then prove personhood with World ID. The proof is the abuse
            gate that stops bots from mass-producing Cloud Run runtimes — World Chain is not used for
            execution; Base mainnet is.
          </p>
        </div>

        <div className="grid cols-2">
          <div className="card pad-lg">
            <div className="card-head">
              <h3>① Connect wallet &amp; sign in</h3>
              <span className={`pill ${isConnected && (!authRequired || signedIn) ? "ok" : ""}`}>
                {!isConnected ? "required" : authRequired && !signedIn ? "sign in" : "connected"}
              </span>
            </div>
            <p className="desc">
              Your wallet stays in your control. It signs a gas-free message to sign you in (Web3 →
              Firebase), then the EIP-7702 authorization, the mint, and funding — never a private key
              leaves your browser.
            </p>
            {isConnected && (!authRequired || signedIn) ? (
              <div className="pill ok"><span className="dot" />{authRequired ? "signed in" : "wallet connected"}</div>
            ) : (
              <WalletButton block />
            )}
            {isConnected && authRequired && !signedIn && (
              <p className="spec-ref" style={{ marginTop: 8 }}>Approve the signature request to finish signing in.</p>
            )}
          </div>

          <div className="card pad-lg">
            <div className="card-head">
              <h3>② World ID human-proof</h3>
              <span className={`pill ${verified ? "ok" : ""}`}>{verified ? "verified" : "required"}</span>
            </div>
            <p className="desc">
              Proof of personhood gates runtime creation (abuse / cost protection). {WORLDID_APP_ID ? "Verify with the World App." : "Dev mode: simulated proof (no real World ID app configured)."}
            </p>
            {verified ? (
              <div className="pill ok"><span className="dot" />human verified</div>
            ) : WORLDID_APP_ID ? (
              <div id="worldid-slot" />
            ) : (
              <button className="btn block" onClick={() => setWorldIdVerified(true)}>
                Simulate World ID proof (dev)
              </button>
            )}
          </div>
        </div>

        <div style={{ marginTop: 24 }}>
          <button className="btn accent" disabled={!passed} onClick={enter}>
            {passed ? "Enter — go to Intent List →" : "Complete both gates to continue"}
          </button>
        </div>
        <p className="footer-note">IntentOS · ETHGlobal NYC 2026 · onboarding gate</p>
      </main>
    </div>
  );
}
