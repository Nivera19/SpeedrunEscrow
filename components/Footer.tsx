"use client";

import {
  CHAIN,
  CONTRACT_ADDRESS,
  EXPLORER_URL,
  FAUCET_URL,
  addressUrl,
} from "@/lib/chain";

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <div className="brand" style={{ marginBottom: 16 }}>
              <span className="brand-mark">SE</span>
              <span>
                <span className="brand-name">SpeedrunEscrow</span>
                <br />
                <span className="brand-sub">adjudicated prize escrow</span>
              </span>
            </div>
            <p style={{ fontSize: 13.5, opacity: 0.62, maxWidth: "44ch" }}>
              An intelligent contract on GenLayer. The prize and the ruling live
              in the same place, the rules cannot be edited out from under a
              runner, and anyone can object with a bond.
            </p>
          </div>

          <div>
            <h4>On chain</h4>
            <ul>
              <li>
                <a
                  href={addressUrl(CONTRACT_ADDRESS)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Contract
                </a>
              </li>
              <li>
                <a href={EXPLORER_URL} target="_blank" rel="noreferrer">
                  Bradbury explorer
                </a>
              </li>
              <li>
                <a href={FAUCET_URL} target="_blank" rel="noreferrer">
                  Testnet faucet
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4>Build</h4>
            <ul>
              <li>
                <a
                  href="https://docs.genlayer.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  GenLayer docs
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/genlayerlabs/skills"
                  target="_blank"
                  rel="noreferrer"
                >
                  Builder skills
                </a>
              </li>
              <li>
                <a
                  href="https://portal.genlayer.foundation/#/builders/resources"
                  target="_blank"
                  rel="noreferrer"
                >
                  Builder portal
                </a>
              </li>
            </ul>
          </div>
        </div>

        <hr
          style={{
            border: "none",
            height: 1,
            background: "rgba(247,242,231,0.16)",
            margin: "36px 0 20px",
          }}
        />

        <div className="spread mono" style={{ fontSize: 11.5, opacity: 0.5 }}>
          <span>
            {CHAIN.name} / chain id {CHAIN.id}
          </span>
          <span style={{ wordBreak: "break-all" }}>{CONTRACT_ADDRESS}</span>
        </div>
      </div>
    </footer>
  );
}
