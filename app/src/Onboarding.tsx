import { useConnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { TopBar } from "./Chrome";
import { useGate, setWorldIdVerified, WORLDID_APP_ID } from "./gate";

// 010 · Owner onboarding. Two gates before entering: (1) connect a wallet, (2) World ID human-proof.
// World ID prevents bot/sybil mass-creation of Cloud Run runtimes (North Star §2). When VITE_WORLDID_APP_ID
// is unset, a clearly-labeled dev simulation stands in for the IDKit widget.
export function Onboarding() {
  const { connect } = useConnect();
  const { isConnected, verified, passed } = useGate();

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
            Two gates before you can launch an Intent: connect your wallet, then prove personhood with
            World ID. The proof is the abuse gate that stops bots from mass-producing Cloud Run
            runtimes — World Chain is not used for execution; Base mainnet is.
          </p>
        </div>

        <div className="grid cols-2">
          <div className="card pad-lg">
            <div className="card-head">
              <h3>① Connect wallet</h3>
              <span className={`pill ${isConnected ? "ok" : ""}`}>{isConnected ? "connected" : "required"}</span>
            </div>
            <p className="desc">Your wallet stays in your control. It signs the EIP-7702 authorization, the mint, and funding — never a private key leaves your browser.</p>
            {isConnected ? (
              <div className="pill ok"><span className="dot" />wallet connected</div>
            ) : (
              <button className="btn primary block" onClick={() => connect({ connector: injected() })}>
                Connect Wallet
              </button>
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
