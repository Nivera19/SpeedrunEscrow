/**
 * Seed the deployed SpeedrunEscrow with a real bounty and a real run, then run
 * verification so the whole consensus path is exercised on Bradbury.
 *
 *   node scripts/seed.mjs              open a bounty, submit a run, verify it
 *   node scripts/seed.mjs --no-verify  skip the slow verification step
 *
 * Reads DEPLOYER_PRIVATE_KEY and NEXT_PUBLIC_CONTRACT_ADDRESS from .env.local.
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
    /* env file is optional when the values are already exported */
  }
}

loadEnv();

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;

if (!PRIVATE_KEY || !CONTRACT) {
  console.error(
    "Missing DEPLOYER_PRIVATE_KEY or NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local"
  );
  process.exit(1);
}

const GEN = 10n ** 18n;
const skipVerify = process.argv.includes("--no-verify");

const account = createAccount(PRIVATE_KEY);
const client = createClient({ chain: testnetBradbury, account });

console.log(`sender    ${account.address}`);
console.log(`contract  ${CONTRACT}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Bradbury rejects submissions with "pipeline backpressure" when its L1 sender
 * queue is saturated. That is a load condition, not a failure, so back off and
 * try again rather than dropping the seed run on the floor.
 */
async function submitWithBackoff(functionName, args, value) {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      return await client.writeContract({
        address: CONTRACT,
        functionName,
        args,
        value,
      });
    } catch (err) {
      const text = String(err?.details ?? err?.message ?? err);
      const busy =
        /backpressure|not currently accepting|-32429|too many requests/i.test(
          text
        );
      if (!busy || attempt === 8) throw err;
      const wait = Math.min(30000, 4000 * attempt);
      process.stdout.write(
        `  node busy, retrying in ${wait / 1000}s (${attempt}/8)\n`
      );
      await sleep(wait);
    }
  }
  throw new Error("unreachable");
}

const DECIDED = new Set([
  "ACCEPTED",
  "FINALIZED",
  "UNDETERMINED",
  "CANCELED",
  "LEADER_TIMEOUT",
  "VALIDATORS_TIMEOUT",
]);

/**
 * Poll for the outcome ourselves rather than relying on
 * waitForTransactionReceipt, which throws outright when a single consensus
 * read fails. A transient RPC error partway through a four minute wait should
 * not abandon a transaction that is already on chain.
 */
async function awaitOutcome(hash, timeoutMs = 300000) {
  const started = Date.now();
  let lastStatus = "";
  while (Date.now() - started < timeoutMs) {
    await sleep(4000);
    try {
      const tx = await client.getTransaction({ hash });
      const status = tx?.statusName ?? tx?.status_name ?? tx?.status;
      if (status && status !== lastStatus) {
        lastStatus = status;
        process.stdout.write(`${status} `);
      }
      if (DECIDED.has(status)) return tx;
    } catch {
      /* transient, keep polling */
    }
  }
  return null;
}

async function write(functionName, args, value = 0n) {
  const hash = await submitWithBackoff(functionName, args, value);
  process.stdout.write(`  ${functionName} ${hash.slice(0, 12)} `);

  const receipt = await awaitOutcome(hash);
  if (!receipt) {
    console.log("timed out");
    throw new Error(`${functionName} did not settle`);
  }

  const outcome = receipt?.txExecutionResultName ?? receipt?.statusName;
  console.log(`-> ${outcome ?? "done"}`);

  if (outcome === "FINISHED_WITH_ERROR") {
    throw new Error(`${functionName} reverted`);
  }
  return receipt;
}

async function read(functionName, args = []) {
  return client.readContract({ address: CONTRACT, functionName, args });
}

const RULES = `Timing starts on file select and ends on the final hit.
Bottle adventure is banned. Wrong warp is banned.
Emulator runs are allowed on default settings with no savestates.
The run must be a single unedited segment, submitted as a public video.
The run must be completed in under 40 minutes to qualify for this bounty.`;

const deadline = new Date(Date.now() + 21 * 86400000)
  .toISOString()
  .replace(/\.\d{3}Z$/, "Z");

let bountyIds = await read("list_bounty_ids");

if (process.argv.includes("--reuse") && bountyIds.length > 0) {
  console.log("\nreusing the newest bounty");
} else {
  console.log("\nopening bounty");
  await write(
    "create_bounty",
    [
      "The Legend of Zelda: Ocarina of Time",
      "Any%",
      "N64",
      RULES,
      "RTA",
      deadline,
    ],
    GEN / 2n
  );
  bountyIds = await read("list_bounty_ids");
}

const bountyId = bountyIds[bountyIds.length - 1];
console.log(`  bounty ${bountyId}`);

console.log("\nsubmitting a clean run");
await write("submit_run", [
  bountyId,
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  1992340,
  JSON.stringify([484120, 701900, 442000, 364320]),
  "Standard Any% route on original N64 hardware. Single segment, no savestates, no bottle adventure.",
]);

console.log("\nsubmitting a run that declares a banned glitch");
await write("submit_run", [
  bountyId,
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  1120000,
  JSON.stringify([560000, 560000]),
  "Used a bottle adventure at 12:30 to skip the water temple, saved about seven minutes.",
]);

const runIds = await read("list_run_ids", [bountyId]);
console.log(`  runs ${runIds.join(", ")}`);

if (!skipVerify) {
  for (const runId of runIds) {
    console.log(`\nverifying ${runId}, this hits the real web and the models`);
    try {
      await write("verify_run", [runId]);
      const run = await read("get_run", [runId]);
      console.log(`  verdict ${run.verdict}`);
      console.log(`  status  ${run.status}`);
      if (run.verdict_reason) console.log(`  reason  ${run.verdict_reason}`);
    } catch (err) {
      console.error(`  verification failed: ${err.message}`);
    }
  }
}

console.log("\nstats", await read("get_stats"));
