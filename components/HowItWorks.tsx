"use client";

export function HowItWorks() {
  return (
    <section className="band band-paper section" id="how">
      <div className="wrap">
        <span className="eyebrow">The pipeline</span>
        <h2
          style={{
            fontSize: "clamp(34px, 4.6vw, 60px)",
            margin: "18px 0 16px",
            maxWidth: "16ch",
          }}
        >
          Nobody has to trust a moderator.
        </h2>
        <p className="lede" style={{ marginBottom: 46 }}>
          Most speedrun rejections are not cheating. They are a wrong category, a
          wrong version, a wrong timing method, or a runner cheerfully describing
          something the rules forbid. All of that is decidable from the
          paperwork, and the paperwork is exactly what a validator set can check
          twice.
        </p>

        <div className="grid-3">
          <div className="step step-1">
            <div className="step-index">01</div>
            <h3>Freeze the rules</h3>
            <p>
              A sponsor funds a prize and pastes the category rules verbatim. The
              text is stored and hashed on chain. If the leaderboard site edits
              those rules next week, runs judged under this bounty are untouched.
            </p>
            <span className="step-tag">keccak256 pinned</span>
          </div>

          <div className="step step-2">
            <div className="step-index">02</div>
            <h3>Judge the dossier</h3>
            <p>
              Verification computes split arithmetic on chain, confirms the video
              is public through a live web call, converts objective rules into
              Python predicates, and evaluates them in a sandbox before any model
              is asked for a verdict.
            </p>
            <span className="step-tag">code before opinion</span>
          </div>

          <div className="step step-3">
            <div className="step-index">03</div>
            <h3>Let anyone object</h3>
            <p>
              A verified run waits out a challenge window. A bonded, specific,
              falsifiable claim reopens the case. A vague one loses the bond. If
              the footage would be needed to decide, the answer is inconclusive
              and the money does not move.
            </p>
            <span className="step-tag">bonded disputes</span>
          </div>
        </div>

        <div
          className="card card-flat"
          style={{
            marginTop: 34,
            background: "var(--ink)",
            color: "var(--paper)",
            borderColor: "var(--ink)",
          }}
        >
          <div className="grid-2" style={{ gap: 30, alignItems: "center" }}>
            <div>
              <h3 style={{ fontSize: 24, marginBottom: 12 }}>
                What this does not do
              </h3>
              <p style={{ fontSize: 14.5, opacity: 0.78, lineHeight: 1.55 }}>
                It does not watch your run. No validator inspects frames, audio
                waveforms, or input logs. Anything that genuinely requires the
                footage returns UNCLEAR and routes to a human panel instead of
                guessing with somebody else&apos;s prize money. Pretending
                otherwise would be the fastest way to lose the community.
              </p>
            </div>
            <div className="stack gap-12">
              {[
                ["Splice detection from pixels", false],
                ["Category rule compliance", true],
                ["Frame level input analysis", false],
                ["Split arithmetic and totals", true],
                ["Emulator fingerprinting", false],
                ["Evidence availability", true],
              ].map(([label, yes]) => (
                <div key={label as string} className="check">
                  <span
                    className={`check-mark ${yes ? "check-ok" : "check-bad"}`}
                  >
                    {yes ? "Y" : "N"}
                  </span>
                  <span style={{ opacity: yes ? 1 : 0.6 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
