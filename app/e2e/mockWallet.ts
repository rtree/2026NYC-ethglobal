// A minimal EIP-1193 mock wallet injected before the app loads, so wagmi's injected connector can
// "log in" headlessly. Read-only: it answers account/chain queries; it does NOT sign or send (the
// money write-path goes through the server's KMS/relayer, not the browser wallet).
export const MOCK_ADDRESS = "0x078383c4c20b4e9732Ac0c30A68b8123D53ea6C9";

export const injectMockWallet = `(${function () {
  const ADDR = "0x078383c4c20b4e9732Ac0c30A68b8123D53ea6C9";
  const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
  let connected = false;
  const provider = {
    isMetaMask: true,
    isConnected: () => true,
    request: async ({ method }: { method: string }) => {
      switch (method) {
        case "eth_chainId":
          return "0x2105"; // 8453
        case "eth_requestAccounts":
          connected = true;
          return [ADDR];
        case "eth_accounts":
          return connected ? [ADDR] : [];
        case "wallet_requestPermissions":
          connected = true;
          return [{ parentCapability: "eth_accounts" }];
        case "wallet_getPermissions":
          return connected ? [{ parentCapability: "eth_accounts" }] : [];
        case "net_version":
          return "8453";
        default:
          return null;
      }
    },
    on: (e: string, cb: (...a: unknown[]) => void) => {
      (listeners[e] = listeners[e] || []).push(cb);
    },
    removeListener: (e: string, cb: (...a: unknown[]) => void) => {
      listeners[e] = (listeners[e] || []).filter((f) => f !== cb);
    },
  };
  // wagmi injected connector looks at window.ethereum (+ EIP-6963 announce).
  (window as unknown as { ethereum: unknown }).ethereum = provider;
  window.addEventListener("eip6963:requestProvider", () => {
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: Object.freeze({
          info: { uuid: "mock-uuid", name: "Mock Wallet", icon: "data:image/svg+xml;base64,PHN2Zy8+", rdns: "dev.intentos.mock" },
          provider,
        }),
      }),
    );
  });
}})()`;
