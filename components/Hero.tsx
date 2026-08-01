"use client";

import { Stamp } from "./Stamp";

export function Hero() {
  return (
    <section className="band band-ink hero" id="top">
      <div className="hero-blobs" aria-hidden="true">
        <div className="blob blob-a" />
        <div className="blob blob-b" />
      </div>

      <div className="wrap hero-grid">
        <div>
          <span className="eyebrow" style={{ color: "var(--lime)" }}>
            Prize escrow with a spine
          </span>

          <h1>
            The judge that
            <br />
            <span className="strike">never watches</span>
            <br />
            <span className="hl">the tape.</span>
          </h1>

          <p className="lede" style={{ opacity: 0.78, marginBottom: 30 }}>
            Speedrun prizes sit in a stranger&apos;s PayPal for months while
            volunteer moderators argue in a Discord thread. SpeedrunEscrow puts
            the money and the ruling in the same place. Rules are frozen and
            hashed on day one. Arithmetic is checked by code. Judgment is made by
            independent AI validators that each form their own opinion, and
            anyone can challenge the outcome with a bond.
          </p>

          <div className="row" style={{ gap: 14 }}>
            <a className="btn btn-lg btn-lime" href="#docket">
              Open the docket
            </a>
            <a className="btn btn-lg btn-on-dark btn-ink" href="#auditor">
              Try the split auditor
            </a>
          </div>

          <div
            className="row"
            style={{ gap: 26, marginTop: 34, opacity: 0.55, fontSize: 12.5 }}
          >
            <span className="mono">GENLAYER TESTNET BRADBURY</span>
            <span className="mono">INTELLIGENT CONTRACT</span>
            <span className="mono">NO ORACLE</span>
          </div>
        </div>

        <div className="stack gap-24">
          <div style={{ textAlign: "center", paddingTop: 8 }}>
            <Stamp verdict="COMPLIANT" size="lg" />
          </div>

          <div className="hero-card">
            <h3>Three layers, most trusted first</h3>

            <div className="layer" style={{ color: "var(--mint)" }}>
              <span className="layer-num">1</span>
              <span className="layer-body">
                <strong style={{ color: "var(--paper)" }}>
                  Deterministic arithmetic
                </strong>
                <span>
                  Splits, totals, and frame rounding are computed on chain. Every
                  node gets the same number. No model can override it.
                </span>
              </span>
            </div>

            <div className="layer" style={{ color: "var(--lime)" }}>
              <span className="layer-num">2</span>
              <span className="layer-body">
                <strong style={{ color: "var(--paper)" }}>
                  Evidence availability
                </strong>
                <span>
                  A live web call confirms the video is public, agreed by strict
                  equality across validators.
                </span>
              </span>
            </div>

            <div className="layer" style={{ color: "var(--amber)" }}>
              <span className="layer-num">3</span>
              <span className="layer-body">
                <strong style={{ color: "var(--paper)" }}>
                  Rule compliance
                </strong>
                <span>
                  Validators each judge the run against the frozen rules and must
                  land on the same verdict and the same cited clause.
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
