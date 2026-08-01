const ATTO = 10n ** 18n;

/** Render an atto scale amount as a short GEN string. */
export function formatGen(atto: string | bigint | number, decimals = 3): string {
  let value: bigint;
  try {
    value = BigInt(atto ?? 0);
  } catch {
    return "0";
  }
  const whole = value / ATTO;
  const rest = value % ATTO;
  if (rest === 0n) return whole.toString();
  const frac = rest.toString().padStart(18, "0").slice(0, decimals).replace(/0+$/, "");
  return frac.length ? `${whole}.${frac}` : whole.toString();
}

/** Turn a GEN string typed by a human into atto scale. */
export function parseGen(input: string): bigint {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return 0n;
  if (!/^\d*\.?\d*$/.test(trimmed)) throw new Error("Amount must be a number");
  const [whole = "0", frac = ""] = trimmed.split(".");
  const padded = (frac + "0".repeat(18)).slice(0, 18);
  return BigInt(whole || "0") * ATTO + BigInt(padded || "0");
}

/** "1:23:45.678" or "23:45.678" from milliseconds. */
export function formatMs(totalMs: number): string {
  if (!Number.isFinite(totalMs) || totalMs < 0) return "00:00.000";
  const ms = Math.floor(totalMs % 1000);
  const totalSeconds = Math.floor(totalMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const tail = `${pad(minutes)}:${pad(seconds)}.${pad(ms, 3)}`;
  return hours > 0 ? `${pad(hours)}:${tail}` : tail;
}

/**
 * Parse the way runners actually write times: "33:12.34", "1:02:19", "1992340ms".
 * Returns milliseconds, or null when the shape is not recognised.
 */
export function parseTimeToMs(input: string): number | null {
  const raw = (input ?? "").trim().toLowerCase();
  if (!raw) return null;

  if (raw.endsWith("ms")) {
    const n = Number(raw.slice(0, -2));
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }

  const parts = raw.split(":");
  if (parts.length > 3) return null;

  let total = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const value = Number(parts[i]);
    if (!Number.isFinite(value) || value < 0) return null;
    if (i < parts.length - 1 && value >= 60 && parts.length > 1 && i > 0) return null;
    total = total * 60 + value;
  }
  return Math.round(total * 1000);
}

export function shortAddress(address?: string | null): string {
  if (!address || address.length < 12) return address ?? "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function isZeroAddress(address?: string | null): boolean {
  return !address || /^0x0{40}$/i.test(address);
}

/** Human readable countdown to an ISO deadline. */
export function untilDeadline(iso?: string | null): {
  passed: boolean;
  label: string;
} {
  if (!iso) return { passed: false, label: "no deadline" };
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return { passed: false, label: "no deadline" };
  const diff = target - Date.now();
  if (diff <= 0) return { passed: true, label: "closed" };

  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return { passed: false, label: `${minutes}m left` };
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return { passed: false, label: `${hours}h left` };
  return { passed: false, label: `${Math.floor(hours / 24)}d left` };
}

export function toIsoDeadline(days: number): string {
  const d = new Date(Date.now() + days * 86400000);
  d.setSeconds(0, 0);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
