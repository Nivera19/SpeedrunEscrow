"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "genlayer-js";
import { CHAIN, CHAIN_ID_HEX, RPC_URL } from "./chain";

/* ------------------------------------------------------------------ */
/* EIP-6963 wallet discovery                                           */
/* ------------------------------------------------------------------ */

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<any>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
};

export type DetectedWallet = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
  provider: Eip1193Provider;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
  }
}

const STORAGE_KEY = "speedrun-escrow.wallet";

function useDiscoveredWallets(): DetectedWallet[] {
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const seen = new Map<string, DetectedWallet>();

    const push = (wallet: DetectedWallet) => {
      if (seen.has(wallet.rdns)) return;
      seen.set(wallet.rdns, wallet);
      setWallets(Array.from(seen.values()));
    };

    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail?.info || !detail?.provider) return;
      push({
        uuid: detail.info.uuid,
        name: detail.info.name,
        icon: detail.info.icon,
        rdns: detail.info.rdns,
        provider: detail.provider,
      });
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Fall back to the injected provider for wallets that never announce.
    const timer = window.setTimeout(() => {
      if (seen.size === 0 && window.ethereum) {
        push({
          uuid: "injected",
          name: "Injected wallet",
          icon: "",
          rdns: "injected",
          provider: window.ethereum,
        });
      }
    }, 350);

    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      window.clearTimeout(timer);
    };
  }, []);

  return wallets;
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

type WalletState = {
  wallets: DetectedWallet[];
  wallet: DetectedWallet | null;
  address: `0x${string}` | null;
  chainOk: boolean;
  connecting: boolean;
  error: string | null;
  balance: bigint | null;
  /** Always available, unauthenticated, used for every view call. */
  readClient: ReturnType<typeof createClient>;
  /** Only present once a wallet is connected. */
  writeClient: ReturnType<typeof createClient> | null;
  connect: (wallet: DetectedWallet) => Promise<void>;
  disconnect: () => void;
  switchChain: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  clearError: () => void;
};

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const wallets = useDiscoveredWallets();
  const [wallet, setWallet] = useState<DetectedWallet | null>(null);
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainOk, setChainOk] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const autoTried = useRef(false);

  const readClient = useMemo(
    () => createClient({ chain: CHAIN, endpoint: RPC_URL }),
    []
  );

  const writeClient = useMemo(() => {
    if (!address || !wallet) return null;
    // Passing the address as a string keeps signing inside the wallet: the SDK
    // routes eth_sendTransaction to the injected provider instead of trying to
    // sign locally with a private key.
    return createClient({
      chain: CHAIN,
      endpoint: RPC_URL,
      account: address,
      provider: wallet.provider as any,
    });
  }, [address, wallet]);

  const ensureChain = useCallback(async (provider: Eip1193Provider) => {
    const current = await provider.request({ method: "eth_chainId" });
    if (String(current).toLowerCase() === CHAIN_ID_HEX.toLowerCase()) return true;

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_ID_HEX }],
      });
      return true;
    } catch (err: any) {
      // 4902 means the wallet has never heard of this chain.
      if (err?.code === 4902 || err?.data?.originalError?.code === 4902) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: CHAIN_ID_HEX,
              chainName: CHAIN.name,
              rpcUrls: [RPC_URL],
              nativeCurrency: CHAIN.nativeCurrency,
              blockExplorers: undefined,
              blockExplorerUrls: CHAIN.blockExplorers?.default.url
                ? [CHAIN.blockExplorers.default.url]
                : undefined,
            },
          ],
        });
        return true;
      }
      throw err;
    }
  }, []);

  const connect = useCallback(
    async (target: DetectedWallet) => {
      setConnecting(true);
      setError(null);
      try {
        const accounts: string[] = await target.provider.request({
          method: "eth_requestAccounts",
        });
        if (!accounts?.length) throw new Error("No account was returned");

        const ok = await ensureChain(target.provider);
        setWallet(target);
        setAddress(accounts[0] as `0x${string}`);
        setChainOk(ok);
        window.localStorage.setItem(STORAGE_KEY, target.rdns);
      } catch (err: any) {
        setError(err?.message ?? "Could not connect");
      } finally {
        setConnecting(false);
      }
    },
    [ensureChain]
  );

  const switchChain = useCallback(async () => {
    if (!wallet) return;
    try {
      const ok = await ensureChain(wallet.provider);
      setChainOk(ok);
    } catch (err: any) {
      setError(err?.message ?? "Could not switch network");
    }
  }, [wallet, ensureChain]);

  const disconnect = useCallback(() => {
    setWallet(null);
    setAddress(null);
    setChainOk(false);
    setBalance(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!address) return;
    try {
      const value = await readClient.getBalance({ address });
      setBalance(value);
    } catch {
      setBalance(null);
    }
  }, [address, readClient]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  // Reconnect silently if the user already approved this wallet before.
  useEffect(() => {
    if (autoTried.current || wallets.length === 0) return;
    autoTried.current = true;

    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const match = wallets.find((w) => w.rdns === saved);
    if (!match) return;

    void (async () => {
      try {
        const accounts: string[] = await match.provider.request({
          method: "eth_accounts",
        });
        if (!accounts?.length) return;
        const current = await match.provider.request({ method: "eth_chainId" });
        setWallet(match);
        setAddress(accounts[0] as `0x${string}`);
        setChainOk(
          String(current).toLowerCase() === CHAIN_ID_HEX.toLowerCase()
        );
      } catch {
        /* stay disconnected */
      }
    })();
  }, [wallets]);

  // Track wallet side changes.
  useEffect(() => {
    if (!wallet?.provider?.on) return;
    const provider = wallet.provider;

    const onAccounts = (accounts: string[]) => {
      if (!accounts?.length) {
        disconnect();
        return;
      }
      setAddress(accounts[0] as `0x${string}`);
    };
    const onChain = (id: string) => {
      setChainOk(String(id).toLowerCase() === CHAIN_ID_HEX.toLowerCase());
    };

    provider.on?.("accountsChanged", onAccounts);
    provider.on?.("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, [wallet, disconnect]);

  const value: WalletState = {
    wallets,
    wallet,
    address,
    chainOk,
    connecting,
    error,
    balance,
    readClient,
    writeClient,
    connect,
    disconnect,
    switchChain,
    refreshBalance,
    clearError: () => setError(null),
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
