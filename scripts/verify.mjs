/**
 * Run verification for every run still sitting in SUBMITTED.
 *
 *   node scripts/verify.mjs            all pending runs
 *   node scripts/verify.mjs r1 r3      specific runs
 *
 * Verification is the slow path: it makes a live web call and two model calls,
 * then every validator repeats the work before comparing verdicts. Expect a
 * minute or more per run, and expect the node to apply backpressure under load.
 */

import { readFileSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

function loadEnv() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* optional */
  }
}

loadEnv();

const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!CONTRACT || !PRIVATE_KEY) {
  console.error("Set NEXT_PUBLIC_CONTRACT_ADDRESS and DEPLOYER_PRIVATE_KEY");
  process.exit(1);
}

const account = createAccount(PRIVATE_KEY);
const client = createClient({ chain: testnetBradbury, account });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const read = (functionName, args = []) =>
  client.readContract({
    address: CONTRACT,
    functionName,
    args,
    transactionHashVariant: "latest-nonfinal",
  });

const DECIDED = new Set([
  "ACCEPTED",
  "FINALIZED",
  "UNDETERMINED",
  "CANCELED",
  "LEADER_TIMEOUT",
  "VALIDATORS_TIMEOUT",
]);

async function submit(runId) {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      return await client.writeContract({
        address: CONTRACT,
        functionName: "verify_run",
        args: [runId],
        value: 0n,
      });
    } catch (err) {
      const text = String(err?.details ?? err?.message ?? err);
      if (!/backpressure|not currently accepting|-32429/i.test(text)) throw err;
      process.stdout.write(".");
      await sleep(Math.min(20000, 3000 * attempt));
    }
  }
  throw new Error("node stayed busy");
}

async function settle(hash, timeoutMs = 900000) {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < timeoutMs) {
    await sleep(4000);
    try {
      const tx = await client.getTransaction({ hash });
      const status = tx?.statusName ?? tx?.status_name ?? tx?.status;
      if (status && status !== last) {
        last = status;
        process.stdout.write(`${status} `);
      }
      if (DECIDED.has(status)) return tx;
    } catch {
      /* transient */
    }
  }
  return null;
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const bountyIds = await read("list_bounty_ids");

const targets = [];
for (const bountyId of bountyIds) {
  for (const runId of await read("list_run_ids", [bountyId])) {
    const run = await read("get_run", [runId]);
    if (wanted.length ? wanted.includes(runId) : run.status === "SUBMITTED") {
      targets.push(runId);
    }
  }
}

if (!targets.length) {
  console.log("nothing to verify");
  process.exit(0);
}

console.log(`verifying ${targets.join(", ")}\n`);

// A timeout or a failure to reach a majority is not a verdict. The consensus
// round simply did not complete under load, and the call is safe to repeat
// because state only changes once a round returns.
const RETRYABLE = new Set([
  "VALIDATORS_TIMEOUT",
  "LEADER_TIMEOUT",
  "UNDETERMINED",
]);

for (const runId of targets) {
  process.stdout.write(`${runId} `);
  try {
    let run = null;
    for (let round = 1; round <= 4; round += 1) {
      const hash = await submit(runId);
      process.stdout.write(`${hash.slice(0, 12)} `);
      const tx = await settle(hash);
      const status = tx?.statusName ?? tx?.status_name ?? "no outcome";
      console.log(`-> ${status}`);

      run = await read("get_run", [runId]);
      if (run.status !== "SUBMITTED") break;

      if (!tx || RETRYABLE.has(status)) {
        console.log(`   consensus did not complete, round ${round} of 4`);
        await sleep(15000);
        continue;
      }
      break;
    }

    console.log(`   status  ${run.status}`);
    console.log(`   verdict ${run.verdict}`);
    if (run.verdict_reason) console.log(`   reason  ${run.verdict_reason}`);
    if (run.evidence_json) {
      const evidence = JSON.parse(run.evidence_json);
      console.log(`   checks  ${JSON.stringify(evidence.checks ?? [])}`);
      if (evidence.cited_rule) console.log(`   cited   ${evidence.cited_rule}`);
    }
  } catch (err) {
    console.log(`failed: ${String(err.message).slice(0, 160)}`);
  }
  console.log();
}

console.log("stats", await read("get_stats"));
