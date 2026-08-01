"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { TX_STAGES, receiptFailed, stageIndex } from "./contract";
import { txUrl } from "./chain";

export type TxRecord = {
  id: number;
  title: string;
  hash?: string;
  stage: string;
  message: string;
  state: "running" | "done" | "failed";
};

type TxContextValue = {
  items: TxRecord[];
  /**
   * Run a write call and follow it all the way through the GenLayer consensus
   * ladder, surfacing each stage as it happens.
   */
  track: (
    title: string,
    submit: () => Promise<`0x${string}`>,
    options?: { client?: any; onDone?: (receipt: any) => void }
  ) => Promise<any | null>;
  note: (title: string, message: string, state?: "done" | "failed") => void;
  dismiss: (id: number) => void;
};

const TxContext = createContext<TxContextValue | null>(null);

function readableError(err: any): string {
  const raw =
    err?.shortMessage ??
    err?.details ??
    err?.message ??
    (typeof err === "string" ? err : "Something went wrong");

  if (/user rejected|denied transaction/i.test(raw)) {
    return "You rejected the request in your wallet.";
  }
  if (/insufficient funds/i.test(raw)) {
    return "Not enough GEN for this transaction. Claim some from the faucet.";
  }
  const bracket = raw.match(/\[(EXPECTED|EXTERNAL|TRANSIENT|LLM_ERROR)\]\s*([^"'\n]+)/);
  if (bracket) return bracket[2].trim();
  return String(raw).slice(0, 240);
}

export function TxProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<TxRecord[]>([]);
  const nextId = useRef(1);

  const update = useCallback((id: number, patch: Partial<TxRecord>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const autoDismiss = useCallback(
    (id: number, delay: number) => {
      window.setTimeout(() => dismiss(id), delay);
    },
    [dismiss]
  );

  const note = useCallback(
    (title: string, message: string, state: "done" | "failed" = "done") => {
      const id = nextId.current++;
      setItems((prev) => [
        ...prev,
        { id, title, message, stage: "", state },
      ]);
      autoDismiss(id, state === "failed" ? 9000 : 5000);
    },
    [autoDismiss]
  );

  const track = useCallback<TxContextValue["track"]>(
    async (title, submit, options) => {
      const id = nextId.current++;
      setItems((prev) => [
        ...prev,
        {
          id,
          title,
          stage: "",
          message: "Waiting for your wallet",
          state: "running",
        },
      ]);

      let hash: `0x${string}`;
      try {
        hash = await submit();
      } catch (err) {
        update(id, { state: "failed", message: readableError(err) });
        autoDismiss(id, 9000);
        return null;
      }

      update(id, {
        hash,
        stage: "PENDING",
        message: "Submitted to the validator set",
      });

      const client = options?.client;
      if (!client) {
        update(id, { state: "done", message: "Submitted" });
        autoDismiss(id, 6000);
        return null;
      }

      // Poll the lifecycle so the ladder in the toast reflects real consensus
      // stages rather than a decorative spinner.
      const started = Date.now();
      let receipt: any = null;

      while (Date.now() - started < 240000) {
        await new Promise((r) => setTimeout(r, 2500));
        try {
          const tx = await client.getTransaction({ hash });
          const status = tx?.statusName ?? tx?.status_name ?? tx?.status;
          if (status && typeof status === "string") {
            update(id, { stage: status, message: describeStage(status) });
          }
          if (
            status === "ACCEPTED" ||
            status === "FINALIZED" ||
            status === "UNDETERMINED" ||
            status === "CANCELED"
          ) {
            receipt = tx;
            break;
          }
        } catch {
          /* keep polling, RPC hiccups are normal */
        }
      }

      if (!receipt) {
        update(id, {
          state: "failed",
          message: "Still pending after four minutes. Check the explorer.",
        });
        autoDismiss(id, 12000);
        return null;
      }

      if (receiptFailed(receipt)) {
        update(id, {
          state: "failed",
          message: extractContractError(receipt),
        });
        autoDismiss(id, 12000);
        return receipt;
      }

      update(id, {
        state: "done",
        stage: receipt.statusName ?? "ACCEPTED",
        message: "Accepted by consensus",
      });
      autoDismiss(id, 7000);
      options?.onDone?.(receipt);
      return receipt;
    },
    [update, autoDismiss]
  );

  const value = useMemo(
    () => ({ items, track, note, dismiss }),
    [items, track, note, dismiss]
  );

  return <TxContext.Provider value={value}>{children}</TxContext.Provider>;
}

function describeStage(status: string): string {
  switch (status) {
    case "PENDING":
      return "Queued for a leader";
    case "PROPOSING":
      return "The leader is running your call";
    case "COMMITTING":
      return "Validators are committing their votes";
    case "REVEALING":
      return "Validators are revealing their votes";
    case "ACCEPTED":
      return "Accepted by consensus";
    case "FINALIZED":
      return "Finalized";
    case "UNDETERMINED":
      return "Validators could not agree. Try again.";
    case "LEADER_TIMEOUT":
    case "VALIDATORS_TIMEOUT":
      return "The validator set timed out. Try again.";
    default:
      return status;
  }
}

function extractContractError(receipt: any): string {
  const candidates = [
    receipt?.consensus_data?.leader_receipt?.[0]?.result,
    receipt?.consensus_data?.leader_receipt?.[0]?.error,
    receipt?.result,
  ];
  for (const item of candidates) {
    if (typeof item === "string" && item.length) {
      const bracket = item.match(
        /\[(EXPECTED|EXTERNAL|TRANSIENT|LLM_ERROR)\]\s*(.+)/
      );
      if (bracket) return bracket[2].slice(0, 200);
    }
  }
  return "The contract rejected this call.";
}

export function useTx(): TxContextValue {
  const ctx = useContext(TxContext);
  if (!ctx) throw new Error("useTx must be used inside TxProvider");
  return ctx;
}

/* ------------------------------------------------------------------ */

export function TxDock() {
  const { items, dismiss } = useTx();
  if (!items.length) return null;

  return (
    <div className="toast-dock">
      {items.map((item) => {
        const active = stageIndex(item.stage);
        const cls =
          item.state === "failed"
            ? "toast toast-err"
            : item.state === "done"
              ? "toast toast-ok"
              : "toast";

        return (
          <div key={item.id} className={cls} onClick={() => dismiss(item.id)}>
            <div className="spread" style={{ alignItems: "flex-start" }}>
              <div>
                <div className="toast-title">{item.title}</div>
                <div className="toast-msg">{item.message}</div>
              </div>
              {item.state === "running" && <div className="spin" />}
            </div>

            {item.state === "running" && (
              <>
                <div className="ladder">
                  {TX_STAGES.map((stage, i) => (
                    <div
                      key={stage}
                      className={
                        i < active
                          ? "rung rung-done"
                          : i === active
                            ? "rung rung-active"
                            : "rung"
                      }
                    />
                  ))}
                </div>
                <div className="rung-labels">
                  <span>queued</span>
                  <span>leader</span>
                  <span>commit</span>
                  <span>reveal</span>
                  <span>accepted</span>
                </div>
              </>
            )}

            {item.hash && (
              <a
                className="toast-msg"
                style={{ display: "block", marginTop: 8, opacity: 0.9 }}
                href={txUrl(item.hash)}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                View on explorer
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
