"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useWallet } from "./wallet";
import {
  Bounty,
  Config,
  Run,
  Stats,
  getConfig,
  getStats,
  loadBounties,
  loadRuns,
} from "./contract";

type StoreValue = {
  stats: Stats | null;
  config: Config | null;
  bounties: Bounty[];
  loading: boolean;
  offline: boolean;
  refresh: () => Promise<void>;
  fetchRuns: (bountyId: string) => Promise<Run[]>;
};

const StoreContext = createContext<StoreValue | null>(null);

/** Two extra attempts with a short backoff, which covers most RPC hiccups. */
async function retry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 700 * (i + 1)));
      }
    }
  }
  throw lastError;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { readClient } = useWallet();
  const [stats, setStats] = useState<Stats | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);

    // Bradbury applies backpressure under load and individual reads fail. Each
    // one is settled independently so a single hiccup cannot blank the page:
    // whatever came back is shown, and whatever did not keeps its last value.
    const [s, c, b] = await Promise.allSettled([
      retry(() => getStats(readClient as any)),
      retry(() => getConfig(readClient as any)),
      retry(() => loadBounties(readClient as any)),
    ]);

    if (s.status === "fulfilled") setStats(s.value);
    if (c.status === "fulfilled") setConfig(c.value);
    if (b.status === "fulfilled") setBounties(b.value);

    setOffline(
      s.status === "rejected" &&
        c.status === "rejected" &&
        b.status === "rejected"
    );
    setLoading(false);
  }, [readClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const fetchRuns = useCallback(
    (bountyId: string) => loadRuns(readClient as any, bountyId),
    [readClient]
  );

  const value = useMemo(
    () => ({ stats, config, bounties, loading, offline, refresh, fetchRuns }),
    [stats, config, bounties, loading, offline, refresh, fetchRuns]
  );

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
