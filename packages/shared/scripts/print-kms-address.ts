// Prints the Ethereum addresses controlled by the KMS SessionKeys. Validates the KMS signer path.
// Run: pnpm dlx tsx packages/shared/scripts/print-kms-address.ts   (uses ADC)
import { getKmsEthAddress, keyVersion, KMS } from "../src/index.js";

const [executor, watcher] = await Promise.all([
  getKmsEthAddress(keyVersion(KMS.executorSessionKey)),
  getKmsEthAddress(keyVersion(KMS.watcherSessionKey)),
]);
console.log(JSON.stringify({ executorSessionKey: executor, watcherSessionKey: watcher }, null, 2));
