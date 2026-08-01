import { CONTRACT_ADDRESS } from "./chain";

type AnyClient = {
  readContract: (args: any) => Promise<any>;
  writeContract: (args: any) => Promise<any>;
  waitForTransactionReceipt: (args: any) => Promise<any>;
  getTransaction: (args: any) => Promise<any>;
};

/* ------------------------------------------------------------------ */
/* Shapes returned by the contract views                               */
/* ------------------------------------------------------------------ */

export type Bounty = {
  bounty_id: string;
  sponsor: string;
  game: string;
  category: string;
  platform: string;
  rules_text: string;
  rules_hash: string;
  timing_method: string;
  prize_atto: string;
  deadline_iso: string;
  status: "OPEN" | "AWARDED" | "REFUNDED";
  winner_run_id: string;
  created_at: string;
  run_count: number;
  required_bond_atto: string;
};

export type RunStatus =
  | "SUBMITTED"
  | "REJECTED"
  | "VERIFIED"
  | "CHALLENGED"
  | "SETTLED";

export type Verdict =
  | "NONE"
  | "COMPLIANT"
  | "VIOLATION"
  | "WRONG_CATEGORY"
  | "UNCLEAR";

export type ChallengeVerdict =
  | "NONE"
  | "UPHELD"
  | "DISMISSED"
  | "INCONCLUSIVE";

export type Run = {
  run_id: string;
  bounty_id: string;
  runner: string;
  video_url: string;
  claimed_ms: number;
  claimed_time: string;
  splits_json: string;
  run_notes: string;
  status: RunStatus;
  submitted_at: string;
  evidence_json: string;
  verdict: Verdict;
  verdict_reason: string;
  challenge_deadline: string;
  challenger: string;
  bond_atto: string;
  challenge_claim: string;
  rebuttal: string;
  challenge_verdict: ChallengeVerdict;
  challenge_reason: string;
};

export type SplitAudit = {
  provided: boolean;
  segments: number;
  sum_ms: number;
  claimed_ms: number;
  delta_ms: number;
  consistent: boolean;
  negative_segment: boolean;
};

export type Evidence = {
  audit?: SplitAudit;
  availability?: {
    reachable: boolean;
    status: number;
    title: string;
    author: string;
    detail: string;
  };
  checks?: { rule: string; result: "SATISFIED" | "VIOLATED" }[];
  cited_rule?: string;
};

export type Stats = {
  bounties: number;
  runs: number;
  verified: number;
  rejected: number;
  paid_atto: string;
};

export type Config = {
  owner: string;
  challenge_window_hours: number;
  bond_bps: number;
};

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

async function read<T>(
  client: AnyClient,
  functionName: string,
  args: unknown[] = []
): Promise<T> {
  const result = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    // Read accepted state rather than finalized state. GenLayer finalization
    // lags acceptance, and reading the finalized view makes a freshly accepted
    // verdict look like it never happened.
    transactionHashVariant: "latest-nonfinal",
  });
  return result as T;
}

export const getConfig = (c: AnyClient) => read<Config>(c, "get_config");
export const getStats = (c: AnyClient) => read<Stats>(c, "get_stats");
export const listBountyIds = (c: AnyClient) =>
  read<string[]>(c, "list_bounty_ids");
export const listRunIds = (c: AnyClient, bountyId: string) =>
  read<string[]>(c, "list_run_ids", [bountyId]);
export const getBounty = (c: AnyClient, bountyId: string) =>
  read<Bounty>(c, "get_bounty", [bountyId]);
export const getRun = (c: AnyClient, runId: string) =>
  read<Run>(c, "get_run", [runId]);
export const previewAudit = (
  c: AnyClient,
  claimedMs: number,
  splitsJson: string
) => read<SplitAudit>(c, "preview_audit", [claimedMs, splitsJson]);

/** Fetch every bounty, newest first. */
export async function loadBounties(client: AnyClient): Promise<Bounty[]> {
  const ids = await listBountyIds(client);
  const settled = await Promise.allSettled(
    ids.map((id) => getBounty(client, id))
  );
  return settled
    .filter(
      (r): r is PromiseFulfilledResult<Bounty> => r.status === "fulfilled"
    )
    .map((r) => r.value)
    .reverse();
}

export async function loadRuns(
  client: AnyClient,
  bountyId: string
): Promise<Run[]> {
  const ids = await listRunIds(client, bountyId);
  const settled = await Promise.allSettled(ids.map((id) => getRun(client, id)));
  return settled
    .filter((r): r is PromiseFulfilledResult<Run> => r.status === "fulfilled")
    .map((r) => r.value);
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export async function send(
  client: AnyClient,
  functionName: string,
  args: unknown[] = [],
  value: bigint = 0n
): Promise<`0x${string}`> {
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value,
  });
  return hash as `0x${string}`;
}

export const createBounty = (
  client: AnyClient,
  input: {
    game: string;
    category: string;
    platform: string;
    rulesText: string;
    timingMethod: string;
    deadlineIso: string;
  },
  prizeAtto: bigint
) =>
  send(
    client,
    "create_bounty",
    [
      input.game,
      input.category,
      input.platform,
      input.rulesText,
      input.timingMethod,
      input.deadlineIso,
    ],
    prizeAtto
  );

export const submitRun = (
  client: AnyClient,
  input: {
    bountyId: string;
    videoUrl: string;
    claimedMs: number;
    splitsJson: string;
    runNotes: string;
  }
) =>
  send(client, "submit_run", [
    input.bountyId,
    input.videoUrl,
    input.claimedMs,
    input.splitsJson,
    input.runNotes,
  ]);

export const verifyRun = (client: AnyClient, runId: string) =>
  send(client, "verify_run", [runId]);

export const challengeRun = (
  client: AnyClient,
  runId: string,
  claim: string,
  bondAtto: bigint
) => send(client, "challenge_run", [runId, claim], bondAtto);

export const respondToChallenge = (
  client: AnyClient,
  runId: string,
  rebuttal: string
) => send(client, "respond_to_challenge", [runId, rebuttal]);

export const judgeChallenge = (client: AnyClient, runId: string) =>
  send(client, "judge_challenge", [runId]);

export const settle = (client: AnyClient, runId: string) =>
  send(client, "settle", [runId]);

export const refundBounty = (client: AnyClient, bountyId: string) =>
  send(client, "refund_bounty", [bountyId]);

/* ------------------------------------------------------------------ */
/* Transaction lifecycle                                               */
/* ------------------------------------------------------------------ */

/**
 * The stages GenLayer moves a transaction through. Optimistic Democracy is the
 * whole point of the network, so the UI shows the real ladder rather than a
 * generic spinner.
 */
export const TX_STAGES = [
  "PENDING",
  "PROPOSING",
  "COMMITTING",
  "REVEALING",
  "ACCEPTED",
  "FINALIZED",
] as const;

export type TxStage = (typeof TX_STAGES)[number];

export function stageIndex(status?: string): number {
  if (!status) return -1;
  const idx = TX_STAGES.indexOf(status as TxStage);
  if (idx >= 0) return idx;
  // Undetermined and timeout states sit outside the happy ladder.
  return status === "UNDETERMINED" ? TX_STAGES.length : -1;
}

export async function waitAccepted(client: AnyClient, hash: string) {
  return client.waitForTransactionReceipt({
    hash,
    status: "ACCEPTED",
    interval: 3000,
    retries: 60,
  });
}

/** Pull the return value the contract method produced, if any. */
export function receiptReturn(receipt: any): string | null {
  const raw =
    receipt?.consensus_data?.leader_receipt?.[0]?.result ??
    receipt?.result ??
    null;
  if (raw == null) return null;
  if (typeof raw === "string") return raw;
  try {
    return JSON.stringify(raw);
  } catch {
    return null;
  }
}

export function receiptFailed(receipt: any): boolean {
  const name = receipt?.txExecutionResultName ?? receipt?.execution_result;
  return name === "FINISHED_WITH_ERROR" || name === "ERROR";
}
