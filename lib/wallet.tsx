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

/* ------------------------------------------------------------------ */
/* Chain switching helpers                                             */
/* ------------------------------------------------------------------ */

function buildAddChainParams() {
  const explorer = CHAIN.blockExplorers?.default.url;
  // Only keys the EIP-3085 payload actually defines. Wallets reject the whole
  // request when they see an unexpected field, and an explicit undefined still
  // counts as present in some implementations.
  const params: Record<string, unknown> = {
    chainId: CHAIN_ID_HEX,
    chainName: CHAIN.name,
    rpcUrls: [RPC_URL],
    nativeCurrency: {
      name: CHAIN.nativeCurrency.name,
      symbol: CHAIN.nativeCurrency.symbol,
      decimals: CHAIN.nativeCurrency.decimals,
    },
  };
  if (explorer) params.blockExplorerUrls = [explorer.replace(/\/$/, "")];
  return params;
}

function errorText(err: any): string {
  return String(
    err?.data?.originalError?.message ??
      err?.data?.message ??
      err?.message ??
      err ??
      ""
  );
}

function errorCode(err: any): number | undefined {
  return err?.code ?? err?.data?.originalError?.code ?? err?.data?.code;
}

function isUnknownChainError(err: any): boolean {
  if (errorCode(err) === 4902) return true;
  return /unrecognized chain|unknown chain|chain .*not (been )?added|try adding the chain/i.test(
    errorText(err)
  );
}

/** Turn wallet RPC errors into something a person can act on. */
function describeWalletError(err: any, walletName: string): string {
  const code = errorCode(err);
  const text = errorText(err);

  if (code === 4001 || /user rejected|user denied/i.test(text)) {
    return "You dismissed the request in your wallet.";
  }
  if (code === -32002 || /already pending|request of type/i.test(text)) {
    return `${walletName} already has a popup waiting. Open the extension, finish or dismiss it, then try again.`;
  }
  if (code === 4900 || /disconnected/i.test(text)) {
    return `${walletName} is locked. Unlock it and try again.`;
  }
  if (/does not support|unsupported method|not supported/i.test(text)) {
    return `${walletName} will not add a custom network from a site. Add ${CHAIN.name} manually: RPC ${RPC_URL}, chain id ${CHAIN.id}, symbol ${CHAIN.nativeCurrency.symbol}.`;
  }
  if (/native currency|symbol|decimals|invalid/i.test(text)) {
    return `${walletName} rejected the network details: ${text.slice(0, 160)}`;
  }
  return text ? text.slice(0, 200) : `${walletName} could not connect.`;
}

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
  /** Resolves true when the wallet is connected and on Bradbury. */
  connect: (wallet: DetectedWallet) => Promise<boolean | undefined>;
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
      // Wallets disagree on how they say "I have never heard of this chain".
      // MetaMask uses 4902, several forks wrap it, and some just return the
      // generic internal error, so the message is checked as well.
      if (!isUnknownChainError(err)) throw err;

      await provider.request({
        method: "wallet_addEthereumChain",
        params: [buildAddChainParams()],
      });

      // Some wallets add the chain without switching to it.
      const after = await provider.request({ method: "eth_chainId" });
      if (String(after).toLowerCase() !== CHAIN_ID_HEX.toLowerCase()) {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: CHAIN_ID_HEX }],
        });
      }
      return true;
    }
  }, []);

  const connect = useCallback(
    async (target: DetectedWallet) => {
      setConnecting(true);
      setError(null);

      // Step one: get an account. This is the part that must succeed.
      let accounts: string[];
      try {
        accounts = await target.provider.request({
          method: "eth_requestAccounts",
        });
      } catch (err: any) {
        setError(describeWalletError(err, target.name));
        setConnecting(false);
        return;
      }

      if (!accounts?.length) {
        setError(
          `${target.name} returned no account. Unlock it and try again.`
        );
        setConnecting(false);
        return;
      }

      setWallet(target);
      setAddress(accounts[0] as `0x${string}`);
      window.localStorage.setItem(STORAGE_KEY, target.rdns);

      // Step two: get onto Bradbury. A failure here is recoverable, so the
      // connection is kept and the header offers a retry rather than throwing
      // the whole session away.
      try {
        setChainOk(await ensureChain(target.provider));
        setConnecting(false);
        return true;
      } catch (err: any) {
        setChainOk(false);
        setError(describeWalletError(err, target.name));
        setConnecting(false);
        return false;
      }
    },
    [ensureChain]
  );

  const switchChain = useCallback(async () => {
    if (!wallet) return;
    setError(null);
    try {
      setChainOk(await ensureChain(wallet.provider));
    } catch (err: any) {
      setError(describeWalletError(err, wallet.name));
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
