import { useState } from "react";
import type { ApiResult } from "./api";
import { invalidateChainState } from "./useChainState";
import { shortHash, txUrl } from "./format";

// A button that runs a write-path API call, shows progress, the resulting tx link or rejection, and
// refreshes the live chain state on success.
export function ActionButton({
  label,
  run,
  className = "btn",
  disabled,
  workingLabel,
}: {
  label: string;
  run: () => Promise<ApiResult>;
  className?: string;
  disabled?: boolean;
  workingLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await run();
      setResult(r);
      invalidateChainState();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <button className={className} onClick={onClick} disabled={busy || disabled}>
        {busy ? (workingLabel ?? "…working") : label}
      </button>
      {result?.txHash && (
        <span className="spec-ref" style={{ marginLeft: 10 }}>
          {result.tokenId ? `#${result.tokenId} · ` : ""}
          <a href={txUrl(result.txHash as `0x${string}`)} target="_blank" rel="noreferrer">
            {shortHash(result.txHash)}
          </a>
        </span>
      )}
      {result && result.ok === false && (
        <span className="pill tightened" style={{ marginLeft: 10 }}>
          rejected: {result.reason}
        </span>
      )}
      {error && (
        <span className="pill fund-exhausted" style={{ marginLeft: 10 }}>
          {error.slice(0, 60)}
        </span>
      )}
    </div>
  );
}
