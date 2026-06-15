// World ID human-proof button (plan/110). Real IDKit v4 flow, used only when the SERVER says World ID
// is configured (worldIdRequiredCached()). Otherwise Onboarding shows the clearly-labeled dev mock.
//
// Flow: backend signs the RP request (/api/worldid/sign) -> IDKit widget hands off to the World App,
// which makes a zero-knowledge Proof of Human bound to the Owner EOA (signal = address) -> the widget's
// handleVerify posts the proof to /api/worldid/verify, where the SERVER verifies it with World and
// stores the nullifier uniquely. On success we flip the local gate so the user can enter.
import { useState } from "react";
import { useAccount } from "wagmi";
import { IDKitRequestWidget, proofOfHuman, type IDKitResult } from "@worldcoin/idkit";
import { api } from "./api";
import { worldIdConfigCached } from "./auth";
import { setWorldIdVerified } from "./gate";

export function WorldIdButton() {
  const { address } = useAccount();
  const cfg = worldIdConfigCached();
  const [open, setOpen] = useState(false);
  const [rpContext, setRpContext] = useState<{
    rp_id: string;
    nonce: string;
    created_at: number;
    expires_at: number;
    signature: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // The proof can only bind to a connected EOA, and only makes sense when the server is configured.
  if (!cfg || !address) return null;

  async function start() {
    setErr(null);
    setBusy(true);
    try {
      const s = await api.worldIdSign(cfg!.action);
      setRpContext({ rp_id: cfg!.rpId, nonce: s.nonce, created_at: s.created_at, expires_at: s.expires_at, signature: s.sig });
      setOpen(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn block" disabled={busy} onClick={start}>
        {busy ? "…preparing" : "Verify with World ID"}
      </button>
      {err && (
        <p className="pill fund-exhausted" style={{ marginTop: 6 }} title={err}>
          World ID: {err.slice(0, 96)}
        </p>
      )}
      {rpContext && (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={cfg.appId as `app_${string}`}
          action={cfg.action}
          rp_context={rpContext}
          allow_legacy_proofs
          preset={proofOfHuman({ signal: address })}
          handleVerify={async (result: IDKitResult) => {
            // SERVER-side verify (never trust the client's word); throws on failure -> widget shows error.
            await api.worldIdVerify(result);
          }}
          onSuccess={() => {
            setOpen(false);
            setWorldIdVerified(true);
          }}
          onError={(code) => setErr(String(code))}
        />
      )}
    </>
  );
}

export default WorldIdButton;
