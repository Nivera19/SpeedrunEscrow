"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet";
import { formatGen, shortAddress } from "@/lib/format";
import { CHAIN, EXPLORER_URL, FAUCET_URL, RPC_URL } from "@/lib/chain";

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
  const [pending, setPending] = useState<string | null>(null);

  const onConnect = async (target: (typeof wallets)[number]) => {
    setPending(target.rdns);
    const ok = await connect(target);
    setPending(null);
    // Only dismiss on a clean connection. Closing on failure is how the last
    // version swallowed every error message before anyone could read it.
    if (ok) setPicking(false);
  };

  const openPicker = () => {
    clearError();
    setPicking(true);
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
                onClick={openPicker}
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
              <div className="notice notice-bad" style={{ marginBottom: 14 }}>
                <strong>Could not connect.</strong>
                <br />
                {error}
                <br />
                <button
                  className="btn btn-sm"
                  style={{ marginTop: 10 }}
                  onClick={clearError}
                >
                  Dismiss
                </button>
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
                  <span style={{ flex: 1 }}>{w.name}</span>
                  {pending === w.rdns && <span className="spin" />}
                </button>
              ))}
            </div>

            <hr className="hr" style={{ margin: "20px 0 16px" }} />

            <details>
              <summary
                className="muted"
                style={{ fontSize: 12.5, cursor: "pointer" }}
              >
                Wallet will not add the network? Add it by hand.
              </summary>
              <div
                className="mono"
                style={{ fontSize: 11.5, lineHeight: 1.9, marginTop: 10 }}
              >
                <div>Name: {CHAIN.name}</div>
                <div style={{ wordBreak: "break-all" }}>RPC: {RPC_URL}</div>
                <div>Chain ID: {CHAIN.id}</div>
                <div>Symbol: {CHAIN.nativeCurrency.symbol}</div>
                <div style={{ wordBreak: "break-all" }}>
                  Explorer: {EXPLORER_URL}
                </div>
              </div>
            </details>

            <p
              className="muted"
              style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 14 }}
            >
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

      {wallet && !chainOk && !picking && (
        <div className="band band-lime" style={{ padding: "12px 0" }}>
          <div
            className="wrap row"
            style={{ justifyContent: "center", fontSize: 13.5 }}
          >
            <span>
              <strong>Connected, but on the wrong network.</strong>{" "}
              {error ?? `Switch to ${CHAIN.name} to send transactions.`}
            </span>
            <button className="btn btn-sm" onClick={switchChain}>
              Switch to Bradbury
            </button>
          </div>
        </div>
      )}
    </>
  );
}
