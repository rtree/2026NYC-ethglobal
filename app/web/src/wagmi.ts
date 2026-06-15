import { http, createConfig } from "wagmi";
import { base } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { BASE_RPC } from "./config";

// Wallet config. EIP-6963 multi-provider discovery is ON, so each installed wallet (MetaMask,
// Coinbase, Auro, ...) shows up as its own connector — this avoids the window.ethereum tug-of-war
// that breaks a single injected() connector when several extensions are present. We also keep a
// generic injected() fallback (target metamask) for wallets that don't announce via EIP-6963.
export const wagmiConfig = createConfig({
  chains: [base],
  multiInjectedProviderDiscovery: true,
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [base.id]: http(BASE_RPC),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
