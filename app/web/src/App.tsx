import { useEffect, useState } from "react";
import { Onboarding } from "./Onboarding";
import { IntentList } from "./IntentList";
import { LaunchFlow } from "./LaunchFlow";
import { LiveConsole } from "./LiveConsole";
import { useGate } from "./gate";

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return hash;
}

// Normalize a hash to one of the 3 destinations (folding legacy deep links).
function routeOf(hash: string): "onboarding" | "intents" | "launch" | "console" {
  if (hash === "#/" || hash === "") return "onboarding";
  if (hash === "#/intents") return "intents";
  if (hash.startsWith("#/launch")) return "launch";
  if (hash === "#/console" || hash === "#/dashboard" || hash === "#/watcher" || hash === "#/result") return "console";
  return "intents";
}

export function App() {
  const hash = useHashRoute();
  const { passed } = useGate();
  const route = routeOf(hash);

  // "#/" is the onboarding screen. It owns its own gates and an explicit "Enter" that navigates to
  // "#/intents". We intentionally do NOT auto-redirect here, so the verified state + Enter step are
  // visible and testable (the gate is honest about each step).
  if (route === "onboarding") {
    return <Onboarding />;
  }

  // ROUTE GUARD: every other destination is gated. Direct links / nav clicks to #/intents, #/launch,
  // #/console must not bypass wallet + Firebase sign-in + World ID — otherwise the page loads but every
  // /api/* call 401s ("missing bearer token"). When the gate isn't passed, show Onboarding in place.
  if (!passed) {
    return <Onboarding />;
  }

  switch (route) {
    case "intents":
      return <IntentList />;
    case "launch":
      return <LaunchFlow />;
    case "console":
      return <LiveConsole />;
    default:
      return <IntentList />;
  }
}
