import { testnetBradbury } from "genlayer-js/chains";

export const CHAIN = testnetBradbury;

export const CHAIN_ID_HEX = `0x${CHAIN.id.toString(16)}`;

export const RPC_URL = CHAIN.rpcUrls.default.http[0];

export const EXPLORER_URL =
  CHAIN.blockExplorers?.default.url?.replace(/\/$/, "") ??
  "https://explorer-bradbury.genlayer.com";

export const FAUCET_URL = "https://testnet-faucet.genlayer.foundation/";

/**
 * Deployed SpeedrunEscrow instance. Override with NEXT_PUBLIC_CONTRACT_ADDRESS
 * when you deploy your own, which is what the deploy script prints.
 */
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ??
  "0x39b24Ab5b04FfE2ED6dC89C41462e88b302fCe1F") as `0x${string}`;

export function txUrl(hash: string) {
  return `${EXPLORER_URL}/tx/${hash}`;
}

export function addressUrl(address: string) {
  return `${EXPLORER_URL}/address/${address}`;
}
