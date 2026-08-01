"use client";

import { useStore } from "@/lib/store";
import { formatGen } from "@/lib/format";
import { CONTRACT_ADDRESS } from "@/lib/chain";

export function Ticker() {
  const { stats, config, offline } = useStore();

  const items = [
    `${stats?.bounties ?? 0} bounties opened`,
    `${stats?.runs ?? 0} runs submitted`,
    `${stats?.verified ?? 0} verified`,
    `${stats?.rejected ?? 0} rejected`,
    `${formatGen(stats?.paid_atto ?? "0", 2)} GEN paid out`,
    `${config?.challenge_window_hours ?? "..."}h challenge window`,
    `${((config?.bond_bps ?? 0) / 100).toFixed(0)}% challenge bond`,
    `contract ${CONTRACT_ADDRESS.slice(0, 10)}`,
    offline ? "rpc unreachable, retrying" : "live on bradbury",
  ];

  const doubled = [...items, ...items];

  return (
    <div className="marquee">
      <div className="marquee-track">
        {doubled.map((text, i) => (
          <span key={i}>
            {text}
            <span style={{ opacity: 0.35, marginLeft: 44 }}>/</span>
          </span>
        ))}
      </div>
    </div>
  );
}
