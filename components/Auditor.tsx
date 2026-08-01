"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { previewAudit, SplitAudit } from "@/lib/contract";
import { formatMs, parseTimeToMs } from "@/lib/format";

const SAMPLE_TIME = "33:12.34";
const SAMPLE_SPLITS = "8:04.12\n11:41.90\n7:22.00\n6:04.32";

/** Turn "8:04.12" lines into an array of millisecond durations. */
export function parseSplitLines(raw: string): {
  ms: number[];
  bad: string[];
} {
  const tokens = raw
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const ms: number[] = [];
  const bad: string[] = [];
  for (const token of tokens) {
    const value = parseTimeToMs(token);
    if (value === null) bad.push(token);
    else ms.push(value);
  }
  return { ms, bad };
}

export function Auditor() {
  const { readClient } = useWallet();
  const [timeText, setTimeText] = useState(SAMPLE_TIME);
  const [splitsText, setSplitsText] = useState(SAMPLE_SPLITS);
  const [audit, setAudit] = useState<SplitAudit | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  const claimedMs = useMemo(() => parseTimeToMs(timeText), [timeText]);
  const parsed = useMemo(() => parseSplitLines(splitsText), [splitsText]);

  useEffect(() => {
    if (claimedMs === null) {
      setAudit(null);
      return;
    }

    const mine = ++seq.current;
    const handle = window.setTimeout(async () => {
      setBusy(true);
      setFailed(false);
      try {
        const result = await previewAudit(
          readClient as any,
          claimedMs,
          JSON.stringify(parsed.ms)
        );
        if (seq.current === mine) setAudit(result);
      } catch {
        if (seq.current === mine) {
          setFailed(true);
          setAudit(null);
        }
      } finally {
        if (seq.current === mine) setBusy(false);
      }
    }, 420);

    return () => window.clearTimeout(handle);
  }, [claimedMs, parsed.ms, readClient]);

  const verdict = !audit
    ? null
    : audit.consistent
      ? { cls: "ok", text: "splits reconcile" }
      : audit.negative_segment
        ? { cls: "bad", text: "negative segment" }
        : !audit.provided
          ? { cls: "warn", text: "no usable splits" }
          : { cls: "bad", text: "splits do not reconcile" };

  return (
    <section className="band band-violet section" id="auditor">
      <div className="wrap">
        <span className="eyebrow">Layer one, live</span>
        <h2
          style={{
            fontSize: "clamp(34px, 4.6vw, 60px)",
            margin: "18px 0 16px",
            maxWidth: "18ch",
          }}
        >
          Every node computes this same number.
        </h2>
        <p className="lede" style={{ marginBottom: 42, opacity: 0.9 }}>
          The split auditor is a read call against the deployed contract on
          Bradbury. No wallet, no gas, no model. Type a time and its segments and
          the chain reconciles them with a two frame tolerance, which is exactly
          what a validator does before any judgment happens.
        </p>

        <div className="auditor on-dark">
          <div className="card" style={{ display: "grid", gap: 20 }}>
            <div className="field field-mono">
              <label htmlFor="claimed">Claimed final time</label>
              <input
                id="claimed"
                value={timeText}
                onChange={(e) => setTimeText(e.target.value)}
                placeholder="33:12.34"
                spellCheck={false}
              />
              <span className="hint">
                Accepts h:mm:ss.ms, mm:ss.ms, or raw milliseconds like 1992340ms
              </span>
            </div>

            <div className="field field-mono">
              <label htmlFor="splits">Segment durations, one per line</label>
              <textarea
                id="splits"
                value={splitsText}
                onChange={(e) => setSplitsText(e.target.value)}
                rows={6}
                spellCheck={false}
              />
              <span className="hint">
                {parsed.ms.length} segment
                {parsed.ms.length === 1 ? "" : "s"} parsed
                {parsed.bad.length > 0
                  ? `, ${parsed.bad.length} unreadable: ${parsed.bad
                      .slice(0, 3)
                      .join(", ")}`
                  : ""}
              </span>
            </div>

            <div className="row">
              <button
                className="btn btn-sm"
                onClick={() => {
                  setTimeText(SAMPLE_TIME);
                  setSplitsText(SAMPLE_SPLITS);
                }}
              >
                Reset example
              </button>
              <button
                className="btn btn-sm btn-coral"
                onClick={() => setSplitsText("8:04.12\n11:41.90\n7:22.00\n5:00.00")}
              >
                Break a segment
              </button>
            </div>
          </div>

          <div className="readout">
            <div className="spread">
              <span
                className="mono"
                style={{ fontSize: 11, letterSpacing: "0.16em", opacity: 0.6 }}
              >
                ON CHAIN READOUT
              </span>
              {busy && <span className="spin" />}
            </div>

            <div className="readout-big">
              {claimedMs === null ? "--:--.---" : formatMs(claimedMs)}
            </div>

            {verdict && (
              <span className={`verdict-line ${verdict.cls}`}>
                <span className="dot" />
                {verdict.text}
              </span>
            )}

            {failed && (
              <span className="verdict-line warn">
                <span className="dot" />
                rpc unreachable
              </span>
            )}

            <div>
              <div className="readout-row">
                <span>segments</span>
                <span>{audit?.segments ?? 0}</span>
              </div>
              <div className="readout-row">
                <span>sum of segments</span>
                <span>{formatMs(audit?.sum_ms ?? 0)}</span>
              </div>
              <div className="readout-row">
                <span>claimed</span>
                <span>{formatMs(audit?.claimed_ms ?? claimedMs ?? 0)}</span>
              </div>
              <div className="readout-row">
                <span>difference</span>
                <span
                  className={
                    (audit?.delta_ms ?? 0) > 34 ? "bad" : "ok"
                  }
                >
                  {audit?.delta_ms ?? 0} ms
                </span>
              </div>
              <div className="readout-row">
                <span>tolerance</span>
                <span>34 ms, two frames at 60 fps</span>
              </div>
              <div className="readout-row">
                <span>negative segment</span>
                <span className={audit?.negative_segment ? "bad" : "ok"}>
                  {audit?.negative_segment ? "yes" : "no"}
                </span>
              </div>
            </div>

            <p style={{ fontSize: 12.5, opacity: 0.6, lineHeight: 1.5 }}>
              A run whose segments do not add up to the claimed time is not
              automatically fraud, but it is a fact the judgment prompt receives
              as ground truth and is forbidden from contradicting.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
