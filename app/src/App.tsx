import { useEffect, useState } from "react";
import { IntentList } from "./IntentList";
import { LaunchFlow } from "./LaunchFlow";
import { OwnerDashboard } from "./OwnerDashboard";
import { WatcherDashboard } from "./WatcherDashboard";
import { ResultScreen } from "./ResultScreen";

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return hash;
}

export function App() {
  const hash = useHashRoute();
  switch (hash) {
    case "#/launch":
      return <LaunchFlow />;
    case "#/dashboard":
      return <OwnerDashboard />;
    case "#/watcher":
      return <WatcherDashboard />;
    case "#/result":
      return <ResultScreen />;
    default:
      return <IntentList />;
  }
}
