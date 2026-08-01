"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { useStore } from "@/lib/store";
import { useTx } from "@/lib/tx";
import {
  Bounty,
  Evidence,
  Run,
  challengeRun,
  judgeChallenge,
  refundBounty,
  respondToChallenge,
  settle,
  submitRun,
  verifyRun,
} from "@/lib/contract";
import {
  formatGen,
  formatMs,
  isZeroAddress,
  parseTimeToMs,
  safeJson,
  shortAddress,
  untilDeadline,
} from "@/lib/format";
import { addressUrl } from "@/lib/chain";
import { Stamp } from "./Stamp";
import { parseSplitLines } from "./Auditor";

export function BountyDrawer({
  bounty,
  onClose,
}: {
  bounty: Bounty;
  onClose: () => void;
}) {
  const { address, writeClient, chainOk } = useWallet();
  const { fetchRuns, refresh } = useStore();
  const { track, note } = useTx();

  const [runs, setRuns] = useState<Run[] | null>(null);
  const [tab, setTab] = useState<"runs" | "submit" | "rules">("runs");
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setRuns(await fetchRuns(bounty.bounty_id));
    } catch {
      setRuns([]);
    }
  }, [bounty.bounty_id, fetchRuns]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const canWrite = Boolean(writeClient && chainOk);
  const isSponsor =
    address && address.toLowerCase() === bounty.sponsor.toLowerCase();
  const deadline = untilDeadline(bounty.deadline_iso);

  const run = useCallback(
    async (title: string, id: string, fn: () => Promise<`0x${string}`>) => {
      if (!writeClient) {
        note("No wallet", "Connect a wallet first.", "failed");
        return;
      }
      setBusyId(id);
      const receipt = await track(title, fn, { client: writeClient });
      setBusyId(null);
      if (receipt) {
        await Promise.all([reload(), refresh()]);
      }
    },
    [writeClient, track, note, reload, refresh]
  );

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-label="Bounty detail">
        <div className="drawer-head">
          <div>
            <span className={`pill pill-${bounty.status.toLowerCase()}`}>
              {bounty.status}
            </span>
            <h2 style={{ fontSize: 30, margin: "12px 0 6px" }}>{bounty.game}</h2>
            <div className="bounty-cat">
              {bounty.category} / {bounty.platform || "any platform"} /{" "}
              {bounty.timing_method}
            </div>
          </div>
          <button className="close" onClick={onClose} aria-label="Close">
            x
          </button>
        </div>

        <div className="drawer-body">
          <div className="grid-2" style={{ gap: 18 }}>
            <div className="card card-flat" style={{ padding: 18 }}>
              <div className="prize">
                {formatGen(bounty.prize_atto, 3)}
                <small>GEN</small>
              </div>
              <div className="stat-label">escrowed prize</div>
            </div>
            <div className="card card-flat" style={{ padding: 18 }}>
              <div className="prize">
                {formatGen(bounty.required_bond_atto, 3)}
                <small>GEN</small>
              </div>
              <div className="stat-label">bond to challenge</div>
            </div>
          </div>

          <div className="row" style={{ fontSize: 13 }}>
            <span className="mono muted">
              sponsor{" "}
              <a
                className="link-plain"
                href={addressUrl(bounty.sponsor)}
                target="_blank"
                rel="noreferrer"
              >
                {shortAddress(bounty.sponsor)}
              </a>
            </span>
            <span className="mono muted">
              submissions {deadline.passed ? "closed" : deadline.label}
            </span>
          </div>

          <div className="tabs">
            <button
              className="tab"
              data-on={tab === "runs"}
              onClick={() => setTab("runs")}
            >
              Runs ({runs?.length ?? bounty.run_count})
            </button>
            <button
              className="tab"
              data-on={tab === "submit"}
              onClick={() => setTab("submit")}
            >
              Submit a run
            </button>
            <button
              className="tab"
              data-on={tab === "rules"}
              onClick={() => setTab("rules")}
            >
              Frozen rules
            </button>
          </div>

          {tab === "rules" && (
            <div className="stack gap-12">
              <div className="rules-box" style={{ whiteSpace: "pre-wrap" }}>
                {bounty.rules_text}
              </div>
              <div className="stack gap-8">
                <span className="stat-label" style={{ marginTop: 0 }}>
                  keccak256 of the rules text
                </span>
                <span className="hash">{bounty.rules_hash}</span>
              </div>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
                This hash is what makes the bounty honest. If the leaderboard
                edits its rules tomorrow, that edit cannot reach back and
                invalidate a run judged here.
              </p>
            </div>
          )}

          {tab === "submit" && (
            <SubmitRun
              bounty={bounty}
              disabled={!canWrite || bounty.status !== "OPEN" || deadline.passed}
              onSubmitted={async () => {
                await Promise.all([reload(), refresh()]);
                setTab("runs");
              }}
            />
          )}

          {tab === "runs" && (
            <div className="stack gap-16">
              {runs === null && (
                <div className="skeleton" style={{ height: 130 }} />
              )}

              {runs?.length === 0 && (
                <div className="notice notice-info">
                  No runs yet. The first submission opens the pipeline.
                </div>
              )}

              {runs?.map((r) => (
                <RunCard
                  key={r.run_id}
                  run={r}
                  bounty={bounty}
                  address={address}
                  canWrite={canWrite}
                  busy={busyId === r.run_id}
                  onVerify={() =>
                    run("Verifying run", r.run_id, () =>
                      verifyRun(writeClient as any, r.run_id)
                    )
                  }
                  onChallenge={(claim, bond) =>
                    run("Filing challenge", r.run_id, () =>
                      challengeRun(writeClient as any, r.run_id, claim, bond)
                    )
                  }
                  onRespond={(text) =>
                    run("Recording rebuttal", r.run_id, () =>
                      respondToChallenge(writeClient as any, r.run_id, text)
                    )
                  }
                  onJudge={() =>
                    run("Judging challenge", r.run_id, () =>
                      judgeChallenge(writeClient as any, r.run_id)
                    )
                  }
                  onSettle={() =>
                    run("Settling", r.run_id, () =>
                      settle(writeClient as any, r.run_id)
                    )
                  }
                />
              ))}

              {isSponsor && bounty.status === "OPEN" && deadline.passed && (
                <button
                  className="btn btn-sm"
                  disabled={!canWrite}
                  onClick={() =>
                    run("Refunding bounty", bounty.bounty_id, () =>
                      refundBounty(writeClient as any, bounty.bounty_id)
                    )
                  }
                >
                  Refund the prize to me
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------ */

function SubmitRun({
  bounty,
  disabled,
  onSubmitted,
}: {
  bounty: Bounty;
  disabled: boolean;
  onSubmitted: () => void | Promise<void>;
}) {
  const { writeClient } = useWallet();
  const { track, note } = useTx();
  const [videoUrl, setVideoUrl] = useState("");
  const [time, setTime] = useState("");
  const [splits, setSplits] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const claimedMs = parseTimeToMs(time);
  const parsed = parseSplitLines(splits);

  const submit = async () => {
    if (!writeClient) return;
    if (!videoUrl.startsWith("https://")) {
      note("Bad link", "The video URL has to start with https.", "failed");
      return;
    }
    if (claimedMs === null || claimedMs <= 0) {
      note("Bad time", "Write the final time as mm:ss.ms or h:mm:ss.", "failed");
      return;
    }

    setBusy(true);
    const receipt = await track(
      "Submitting run",
      () =>
        submitRun(writeClient as any, {
          bountyId: bounty.bounty_id,
          videoUrl,
          claimedMs,
          splitsJson: JSON.stringify(parsed.ms),
          runNotes: notes,
        }),
      { client: writeClient }
    );
    setBusy(false);
    if (receipt) {
      setVideoUrl("");
      setTime("");
      setSplits("");
      setNotes("");
      await onSubmitted();
    }
  };

  return (
    <div className="stack gap-16">
      {disabled && (
        <div className="notice notice-info">
          Submissions are closed for this bounty, or your wallet is not connected
          to Bradbury.
        </div>
      )}

      <div className="field">
        <label htmlFor="video">Public video URL</label>
        <input
          id="video"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          spellCheck={false}
        />
        <span className="hint">
          It has to stay public through the challenge window. Availability is
          rechecked before anything pays out.
        </span>
      </div>

      <div className="grid-2" style={{ gap: 16 }}>
        <div className="field field-mono">
          <label htmlFor="rtime">Final time</label>
          <input
            id="rtime"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="33:12.34"
            spellCheck={false}
          />
          <span className="hint">
            {claimedMs === null ? "not parsed yet" : formatMs(claimedMs)}
          </span>
        </div>
        <div className="field field-mono">
          <label htmlFor="rsplits">Segments, one per line</label>
          <textarea
            id="rsplits"
            rows={4}
            value={splits}
            onChange={(e) => setSplits(e.target.value)}
            placeholder={"8:04.12\n11:41.90"}
            spellCheck={false}
          />
          <span className="hint">{parsed.ms.length} parsed, optional</span>
        </div>
      </div>

      <div className="field">
        <label htmlFor="rnotes">Run notes</label>
        <textarea
          id="rnotes"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Route, version, hardware, anything a judge should know."
        />
        <span className="hint">
          Be honest here. The judgment reads your own description against the
          frozen rules, and most rejections start with a runner describing
          something the rules forbid.
        </span>
      </div>

      <button
        className="btn btn-cobalt"
        onClick={submit}
        disabled={disabled || busy}
      >
        {busy && <span className="spin" />}
        {busy ? "Sending" : "Submit run"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RunCard({
  run,
  bounty,
  address,
  canWrite,
  busy,
  onVerify,
  onChallenge,
  onRespond,
  onJudge,
  onSettle,
}: {
  run: Run;
  bounty: Bounty;
  address: string | null;
  canWrite: boolean;
  busy: boolean;
  onVerify: () => void;
  onChallenge: (claim: string, bond: bigint) => void;
  onRespond: (text: string) => void;
  onJudge: () => void;
  onSettle: () => void;
}) {
  const [claim, setClaim] = useState("");
  const [rebuttal, setRebuttal] = useState("");
  const [showChallenge, setShowChallenge] = useState(false);

  const evidence = safeJson<Evidence>(run.evidence_json, {});
  const isRunner = address && address.toLowerCase() === run.runner.toLowerCase();
  const window_ = untilDeadline(run.challenge_deadline);
  const bond = BigInt(bounty.required_bond_atto || "0");

  return (
    <div className="run">
      <div className="run-head">
        <div>
          <div className="run-time">{run.claimed_time}</div>
          <div
            className="mono muted"
            style={{ fontSize: 11.5, marginTop: 5 }}
          >
            {run.run_id} / {shortAddress(run.runner)}
            {isRunner ? " / you" : ""}
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className="pill">{run.status}</span>
          {run.verdict !== "NONE" && <Stamp verdict={run.verdict} />}
        </div>
      </div>

      <a
        className="mono link-plain"
        style={{ fontSize: 12, wordBreak: "break-all" }}
        href={run.video_url}
        target="_blank"
        rel="noreferrer"
      >
        {run.video_url}
      </a>

      {run.run_notes && <div className="quote">{run.run_notes}</div>}

      {(run.verdict_reason || evidence.audit || evidence.checks?.length) && (
        <div className="evidence">
          {run.verdict_reason && (
            <p style={{ fontSize: 13.5, lineHeight: 1.55 }}>
              <strong>Ruling. </strong>
              {run.verdict_reason}
            </p>
          )}

          {evidence.cited_rule && (
            <p style={{ fontSize: 12.5 }} className="muted">
              Cited clause: {evidence.cited_rule}
            </p>
          )}

          {evidence.audit && (
            <div className="check">
              <span
                className={`check-mark ${
                  evidence.audit.consistent ? "check-ok" : "check-bad"
                }`}
              >
                {evidence.audit.consistent ? "Y" : "N"}
              </span>
              <span>
                splits {evidence.audit.consistent ? "reconcile" : "do not reconcile"}
                {evidence.audit.provided
                  ? ` (${evidence.audit.segments} segments, ${evidence.audit.delta_ms}ms off)`
                  : " (none provided)"}
              </span>
            </div>
          )}

          {evidence.availability && (
            <div className="check">
              <span
                className={`check-mark ${
                  evidence.availability.reachable ? "check-ok" : "check-bad"
                }`}
              >
                {evidence.availability.reachable ? "Y" : "N"}
              </span>
              <span>
                evidence {evidence.availability.reachable ? "public" : "unreachable"}
                {evidence.availability.title
                  ? ` / ${evidence.availability.title.slice(0, 54)}`
                  : ""}
              </span>
            </div>
          )}

          {evidence.checks?.map((c, i) => (
            <div className="check" key={i}>
              <span
                className={`check-mark ${
                  c.result === "SATISFIED" ? "check-ok" : "check-bad"
                }`}
              >
                {c.result === "SATISFIED" ? "Y" : "N"}
              </span>
              <span>{c.rule}</span>
            </div>
          ))}
        </div>
      )}

      {run.challenge_claim && (
        <div className="evidence">
          <div className="spread">
            <span className="stat-label" style={{ marginTop: 0 }}>
              challenge by {shortAddress(run.challenger)}
            </span>
            {run.challenge_verdict !== "NONE" && (
              <Stamp verdict={run.challenge_verdict} />
            )}
          </div>
          <div className="quote" style={{ borderColor: "var(--coral)" }}>
            {run.challenge_claim}
          </div>
          {run.rebuttal && (
            <div className="quote" style={{ borderColor: "var(--cobalt)" }}>
              <strong>Runner. </strong>
              {run.rebuttal}
            </div>
          )}
          {run.challenge_reason && (
            <p style={{ fontSize: 13.5, lineHeight: 1.55 }}>
              <strong>Appeal ruling. </strong>
              {run.challenge_reason}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="row" style={{ gap: 10 }}>
        {busy && <span className="spin" />}

        {run.status === "SUBMITTED" && (
          <button
            className="btn btn-sm btn-lime"
            disabled={!canWrite || busy}
            onClick={onVerify}
          >
            Run verification
          </button>
        )}

        {run.status === "VERIFIED" && !window_.passed && !isRunner && (
          <button
            className="btn btn-sm btn-coral"
            disabled={!canWrite || busy}
            onClick={() => setShowChallenge((v) => !v)}
          >
            Challenge ({formatGen(bond, 2)} GEN bond)
          </button>
        )}

        {run.status === "VERIFIED" && window_.passed && (
          <button
            className="btn btn-sm btn-cobalt"
            disabled={!canWrite || busy}
            onClick={onSettle}
          >
            Settle
          </button>
        )}

        {run.status === "VERIFIED" && !window_.passed && (
          <span className="pill pill-live">
            <span className="dot dot-pulse" />
            {window_.label} to object
          </span>
        )}

        {run.status === "CHALLENGED" && run.challenge_verdict === "NONE" && (
          <>
            {isRunner && (
              <button
                className="btn btn-sm"
                disabled={!canWrite || busy}
                onClick={() => setShowChallenge((v) => !v)}
              >
                {run.rebuttal ? "Edit rebuttal" : "Write rebuttal"}
              </button>
            )}
            <button
              className="btn btn-sm btn-violet"
              disabled={!canWrite || busy}
              onClick={onJudge}
            >
              Judge the challenge
            </button>
          </>
        )}

        {run.status === "CHALLENGED" && run.challenge_verdict !== "NONE" && (
          <button
            className="btn btn-sm btn-cobalt"
            disabled={!canWrite || busy}
            onClick={onSettle}
          >
            Settle
          </button>
        )}

        {run.verdict === "UNCLEAR" && run.status === "VERIFIED" && (
          <span className="pill">panel required</span>
        )}
      </div>

      {showChallenge && run.status === "VERIFIED" && (
        <div className="stack gap-12">
          <div className="field">
            <label htmlFor={`claim-${run.run_id}`}>
              What exactly is wrong with this run
            </label>
            <textarea
              id={`claim-${run.run_id}`}
              rows={3}
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              placeholder="At 12:34 the audio cuts mid transition, which contradicts the single segment rule."
            />
            <span className="hint">
              {claim.trim().length}/40 characters minimum. A claim with no
              timestamp and no rule reference is judged vague and loses the bond.
            </span>
          </div>
          <button
            className="btn btn-sm btn-coral"
            disabled={!canWrite || claim.trim().length < 40 || busy}
            onClick={() => {
              onChallenge(claim, bond);
              setShowChallenge(false);
            }}
          >
            Post {formatGen(bond, 2)} GEN and file
          </button>
        </div>
      )}

      {showChallenge && run.status === "CHALLENGED" && isRunner && (
        <div className="stack gap-12">
          <div className="field">
            <label htmlFor={`reb-${run.run_id}`}>Your rebuttal</label>
            <textarea
              id={`reb-${run.run_id}`}
              rows={3}
              value={rebuttal}
              onChange={(e) => setRebuttal(e.target.value)}
              placeholder="That transition is a load, not a cut. The input display keeps running across it."
            />
          </div>
          <button
            className="btn btn-sm btn-cobalt"
            disabled={!canWrite || !rebuttal.trim() || busy}
            onClick={() => {
              onRespond(rebuttal);
              setShowChallenge(false);
            }}
          >
            Record rebuttal
          </button>
        </div>
      )}

      {!isZeroAddress(run.challenger) && run.bond_atto !== "0" && (
        <span className="mono muted" style={{ fontSize: 11.5 }}>
          bond held {formatGen(run.bond_atto, 3)} GEN
        </span>
      )}
    </div>
  );
}
