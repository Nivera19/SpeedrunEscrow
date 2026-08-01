"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet";
import { formatGen, shortAddress } from "@/lib/format";
import { CHAIN, FAUCET_URL } from "@/lib/chain";

export function Nav() {
  const {
    wallets,
    wallet,
    address,
    chainOk,
    connecting,
    error,
    balance,
    connect,
    disconnect,
    switchChain,
    clearError,
  } = useWallet();
  const [picking, setPicking] = useState(false);

  const onConnect = async (target: (typeof wallets)[number]) => {
    await connect(target);
    setPicking(false);
  };

  return (
    <>
      <nav className="nav">
        <div className="wrap nav-inner">
          <a className="brand" href="#top">
            <span className="brand-mark">SE</span>
            <span>
              <span className="brand-name">SpeedrunEscrow</span>
              <br />
              <span className="brand-sub">Bradbury testnet</span>
            </span>
          </a>

          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#auditor">Split auditor</a>
            <a href="#docket">The docket</a>
            <a href="#limits">Limits</a>
          </div>

          <div className="row" style={{ gap: 10 }}>
            {address && !chainOk && (
              <button className="btn btn-sm btn-coral" onClick={switchChain}>
                Switch to Bradbury
              </button>
            )}

            {address ? (
              <div className="row" style={{ gap: 8 }}>
                <span className="pill">
                  <span className="dot" style={{ background: "#2fe0a0" }} />
                  {balance !== null ? `${formatGen(balance, 2)} GEN` : "GEN"}
                </span>
                <button
                  className="btn btn-sm"
                  onClick={disconnect}
                  title="Disconnect"
                >
                  {shortAddress(address)}
                </button>
              </div>
            ) : (
              <button
                className="btn btn-lime"
                onClick={() => setPicking(true)}
                disabled={connecting}
              >
                {connecting ? <span className="spin" /> : null}
                {connecting ? "Connecting" : "Connect wallet"}
              </button>
            )}
          </div>
        </div>
      </nav>

      {picking && (
        <div className="modal">
          <div
            className="scrim"
            onClick={() => setPicking(false)}
            aria-hidden="true"
          />
          <div className="modal-card">
            <div className="spread" style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: 26 }}>Connect a wallet</h3>
              <button className="close" onClick={() => setPicking(false)}>
                x
              </button>
            </div>

            <p
              className="muted"
              style={{ fontSize: 13.5, marginBottom: 18, lineHeight: 1.5 }}
            >
              Signing stays inside your wallet. The app never sees a private key,
              and every write goes to {CHAIN.name} at chain id {CHAIN.id}.
            </p>

            {error && (
              <div
                className="notice notice-bad"
                style={{ marginBottom: 14 }}
                onClick={clearError}
              >
                {error}
              </div>
            )}

            <div className="wallet-list">
              {wallets.length === 0 && (
                <div className="notice notice-info">
                  No browser wallet detected. Install MetaMask, Rabby, or any
                  EIP-1193 wallet, then reload this page.
                </div>
              )}

              {wallets.map((w) => (
                <button
                  key={w.uuid}
                  className="wallet-option"
                  onClick={() => onConnect(w)}
                  disabled={connecting}
                >
                  {w.icon ? (
                    <img src={w.icon} alt="" />
                  ) : (
                    <span
                      className="brand-mark"
                      style={{ width: 26, height: 26, fontSize: 12 }}
                    >
                      W
                    </span>
                  )}
                  {w.name}
                </button>
              ))}
            </div>

            <hr className="hr" style={{ margin: "20px 0 16px" }} />

            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              Testnet GEN is free. Grab some from the{" "}
              <a
                className="link-plain"
                href={FAUCET_URL}
                target="_blank"
                rel="noreferrer"
              >
                GenLayer faucet
              </a>{" "}
              before opening a bounty.
            </p>
          </div>
        </div>
      )}

      {wallet && !chainOk && (
        <div
          className="band band-lime"
          style={{ padding: "10px 0", textAlign: "center", fontSize: 13.5 }}
        >
          <strong>Wrong network.</strong> Switch your wallet to {CHAIN.name} to
          send transactions.
        </div>
      )}
    </>
  );
}
