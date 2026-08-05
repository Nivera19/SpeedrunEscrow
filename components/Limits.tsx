"use client";

import { useStore } from "@/lib/store";
import { formatGen } from "@/lib/format";

export function Limits() {
  const { stats, config } = useStore();

  return (
    <section className="band band-paper section" id="limits">
      <div className="wrap">
        <div className="grid-4" style={{ marginBottom: 56 }}>
          {[
            [stats?.bounties ?? 0, "bounties opened"],
            [stats?.runs ?? 0, "runs submitted"],
            [stats?.verified ?? 0, "verified"],
            [formatGen(stats?.paid_atto ?? "0", 2), "GEN settled"],
          ].map(([value, label]) => (
            <div key={label as string}>
              <div className="big-num">{value}</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>

        <div className="grid-2" style={{ gap: 34, alignItems: "start" }}>
          <div>
            <span className="eyebrow">Known limits</span>
            <h2
              style={{
                fontSize: "clamp(30px, 4vw, 48px)",
                margin: "18px 0 18px",
                maxWidth: "16ch",
              }}
            >
              The honest list of what can still go wrong.
            </h2>
            <p className="lede">
              A judgment system that oversells itself is worse than no judgment
              system. Here is what is genuinely unsolved, written down before
              anyone has to discover it the hard way.
            </p>
          </div>

          <div className="stack gap-16">
            <Limit
              title="Prompt injection is real"
              body="The contract reads user controlled text: run notes, video titles, page content. Somebody will eventually write instructions in there aimed at the model. Markers are stripped, untrusted text is fenced and labelled as data, and no single field decides a verdict alone. But every validator reads the same poisoned page, so consensus does not fully save you. The challenge window is the last line of defence."
            />
            <Limit
              title="Evidence has to survive to settlement"
              body="Settling re-fetches the video before any prize moves, so taking it down after verification does not get paid. What is still missing is an archival snapshot, so a video that is edited rather than removed, or that goes down and comes back around the settlement call, is not caught."
            />
            <Limit
              title="Validators use different models"
              body={`That is the point, and it is also the risk. The decision space is deliberately tiny, four verdicts, and a violation must cite an overlapping clause. ${
                config
                  ? `This deployment gives challengers ${config.challenge_window_hours} hour${
                      config.challenge_window_hours === 1 ? "" : "s"
                    } and charges a ${(config.bond_bps / 100).toFixed(0)} percent bond.`
                  : ""
              }`}
            />
            <Limit
              title="There is no human panel wired up yet"
              body="UNCLEAR verdicts park correctly and refuse to pay out, which is the right behaviour. The multisig that would resolve them is future work, not a shipped feature."
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Limit({ title, body }: { title: string; body: string }) {
  return (
    <div className="card card-flat" style={{ padding: 20 }}>
      <h3 style={{ fontSize: 18, marginBottom: 8 }}>{title}</h3>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, opacity: 0.78 }}>{body}</p>
    </div>
  );
}
