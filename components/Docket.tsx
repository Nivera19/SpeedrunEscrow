"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useWallet } from "@/lib/wallet";
import { useTx } from "@/lib/tx";
import { createBounty } from "@/lib/contract";
import {
  formatGen,
  parseGen,
  toIsoDeadline,
  untilDeadline,
} from "@/lib/format";
import { BountyDrawer } from "./BountyDrawer";

const PRESET_RULES = `Timing starts on file select and ends on the final hit.
Bottle adventure is banned. Wrong warp is banned.
Emulator runs are allowed on default settings with no savestates.
The run must be a single unedited segment, submitted as a public video.
Any version of the game released in the runner's own region is allowed.`;

export function Docket() {
  const { bounties, loading, offline, refresh } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const open = bounties.find((b) => b.bounty_id === openId) ?? null;

  return (
    <section className="band band-paper-2 section" id="docket">
      <div className="wrap">
        <div className="spread" style={{ marginBottom: 34 }}>
          <div>
            <span className="eyebrow">The docket</span>
            <h2
              style={{
                fontSize: "clamp(34px, 4.6vw, 60px)",
                margin: "18px 0 0",
              }}
            >
              Open cases.
            </h2>
          </div>
          <div className="row">
            <button className="btn btn-sm" onClick={() => void refresh()}>
              Refresh
            </button>
            <button
              className="btn btn-lime"
              onClick={() => setCreating((v) => !v)}
            >
              {creating ? "Close form" : "Open a bounty"}
            </button>
          </div>
        </div>

        {creating && <CreateBounty onDone={() => setCreating(false)} />}

        {offline && (
          <div className="notice notice-bad" style={{ marginBottom: 24 }}>
            Could not reach the Bradbury RPC. The docket below may be stale.
          </div>
        )}

        {loading && bounties.length === 0 && (
          <div className="grid-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ height: 210 }} />
            ))}
          </div>
        )}

        {!loading && bounties.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: 54 }}>
            <h3 style={{ fontSize: 26, marginBottom: 10 }}>
              The docket is empty.
            </h3>
            <p className="muted" style={{ fontSize: 14.5 }}>
              Be the first sponsor. Fund a prize, paste the category rules, and
              let the validator set do the arguing.
            </p>
          </div>
        )}

        {bounties.length > 0 && (
          <div className="grid-3">
            {bounties.map((b) => {
              const deadline = untilDeadline(b.deadline_iso);
              return (
                <button
                  key={b.bounty_id}
                  className="card card-hover bounty"
                  onClick={() => setOpenId(b.bounty_id)}
                >
                  <div className="bounty-top">
                    <div>
                      <h3>{b.game}</h3>
                      <div className="bounty-cat">
                        {b.category} / {b.platform || "any platform"}
                      </div>
                    </div>
                    <span className={`pill pill-${b.status.toLowerCase()}`}>
                      {b.status}
                    </span>
                  </div>

                  <div className="prize">
                    {formatGen(b.prize_atto, 2)}
                    <small>GEN</small>
                  </div>

                  <div className="spread" style={{ fontSize: 12.5 }}>
                    <span className="mono muted">
                      {b.run_count} run{b.run_count === 1 ? "" : "s"}
                    </span>
                    <span className={`mono ${deadline.passed ? "muted" : ""}`}>
                      {deadline.label}
                    </span>
                  </div>

                  <div
                    className="mono"
                    style={{
                      fontSize: 10.5,
                      opacity: 0.42,
                      wordBreak: "break-all",
                    }}
                  >
                    rules {b.rules_hash.slice(0, 22)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {open && (
        <BountyDrawer bounty={open} onClose={() => setOpenId(null)} />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function CreateBounty({ onDone }: { onDone: () => void }) {
  const { writeClient, address, chainOk } = useWallet();
  const { track, note } = useTx();
  const { refresh } = useStore();

  const [game, setGame] = useState("The Legend of Zelda: Ocarina of Time");
  const [category, setCategory] = useState("Any%");
  const [platform, setPlatform] = useState("N64");
  const [timing, setTiming] = useState("RTA");
  const [rules, setRules] = useState(PRESET_RULES);
  const [prize, setPrize] = useState("0.5");
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false);

  const disabled = !writeClient || !chainOk || busy;

  const submit = async () => {
    if (!writeClient) return;
    let prizeAtto: bigint;
    try {
      prizeAtto = parseGen(prize);
    } catch (err: any) {
      note("Bad amount", err.message, "failed");
      return;
    }
    if (prizeAtto <= 0n) {
      note("Bad amount", "The prize has to be greater than zero.", "failed");
      return;
    }
    if (rules.trim().length < 20) {
      note("Rules too thin", "Paste the real category rules, verbatim.", "failed");
      return;
    }

    setBusy(true);
    const receipt = await track(
      "Opening bounty",
      () =>
        createBounty(
          writeClient as any,
          {
            game,
            category,
            platform,
            rulesText: rules,
            timingMethod: timing,
            deadlineIso: toIsoDeadline(days),
          },
          prizeAtto
        ),
      { client: writeClient }
    );
    setBusy(false);

    if (receipt) {
      await refresh();
      onDone();
    }
  };

  return (
    <div className="card" style={{ marginBottom: 30 }}>
      <h3 style={{ fontSize: 24, marginBottom: 6 }}>Open a bounty</h3>
      <p className="muted" style={{ fontSize: 13.5, marginBottom: 22 }}>
        The prize is escrowed by the contract the moment this transaction is
        accepted. The rules you paste are frozen and hashed, and they are the
        only rules any run under this bounty will ever be judged against.
      </p>

      {!address && (
        <div className="notice notice-info" style={{ marginBottom: 20 }}>
          Connect a wallet to open a bounty. Reading the docket needs nothing.
        </div>
      )}

      <div className="grid-2" style={{ gap: 18, marginBottom: 18 }}>
        <div className="field">
          <label htmlFor="game">Game</label>
          <input id="game" value={game} onChange={(e) => setGame(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cat">Category</label>
          <input
            id="cat"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="plat">Platform</label>
          <input
            id="plat"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="timing">Timing method</label>
          <select
            id="timing"
            value={timing}
            onChange={(e) => setTiming(e.target.value)}
          >
            <option value="RTA">RTA</option>
            <option value="IGT">IGT</option>
            <option value="LRT">Load removed</option>
          </select>
        </div>
      </div>

      <div className="field" style={{ marginBottom: 18 }}>
        <label htmlFor="rules">Category rules, verbatim</label>
        <textarea
          id="rules"
          rows={7}
          value={rules}
          onChange={(e) => setRules(e.target.value)}
        />
        <span className="hint">
          Copy them from the leaderboard exactly. Do not summarise: the model is
          asked to cite a clause, and it can only cite what is here.
        </span>
      </div>

      <div className="grid-2" style={{ gap: 18, marginBottom: 22 }}>
        <div className="field field-mono">
          <label htmlFor="prize">Prize in GEN</label>
          <input
            id="prize"
            value={prize}
            onChange={(e) => setPrize(e.target.value)}
            inputMode="decimal"
          />
          <span className="hint">
            Challenge bonds are a percentage of this, set at deploy time.
          </span>
        </div>
        <div className="field field-mono">
          <label htmlFor="days">Submission window in days</label>
          <input
            id="days"
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 1)}
          />
          <span className="hint">
            Closes {toIsoDeadline(days).replace("T", " ").replace("Z", " UTC")}
          </span>
        </div>
      </div>

      <div className="row">
        <button className="btn btn-lime" onClick={submit} disabled={disabled}>
          {busy && <span className="spin" />}
          {busy ? "Sending" : `Escrow ${prize || "0"} GEN`}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
