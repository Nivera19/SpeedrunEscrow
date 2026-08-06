# SpeedrunEscrow

Adjudicated prize escrow for speedrunning, built as a GenLayer Intelligent
Contract on Testnet Bradbury with a Next.js frontend.

**Live contract:** `0x39b24Ab5b04FfE2ED6dC89C41462e88b302fCe1F`
([explorer](https://explorer-bradbury.genlayer.com/address/0x39b24Ab5b04FfE2ED6dC89C41462e88b302fCe1F))

---

## The idea in one paragraph

Speedrun prize money sits in a stranger's PayPal for months while volunteer
moderators argue in a Discord thread. The verification backlog is real, the
rulings are unappealable, and the rules on the leaderboard can change after your
run was accepted. SpeedrunEscrow puts the prize and the ruling in the same
place: rules are frozen and hashed when the bounty opens, split arithmetic is
recomputed on chain, evidence availability is agreed by strict equality, and
rule compliance is judged by independent AI validators that each form their own
opinion before comparing verdicts.

## The one thing to understand first

**The contract never watches the video.** No validator inspects frames, audio
waveforms, or input logs. Designing around that limit is the whole architecture:

> The contract is a judge, not a video analyst. It rules on the dossier, the way
> a real judge rules on evidence presented rather than by witnessing the crime.

This still covers most real rejections in speedrunning, which are not cheating
at all: wrong category, wrong version, wrong timing method, or a runner
cheerfully describing something the rules forbid. Anything that genuinely needs
the footage returns `UNCLEAR` and refuses to pay out.

---

## Three layers, ordered by how much they can be trusted

| Layer | What it decides | Consensus mechanism |
|---|---|---|
| 1. Arithmetic | Do the splits add up to the claimed time? | None needed. Pure deterministic math in the contract body, identical on every node. |
| 2. Availability | Is the evidence actually public? | `gl.eq_principle.strict_eq` over a YouTube oEmbed probe, with only stable fields extracted. Run again at settlement. |
| 3. Compliance | Does the run break a frozen rule? | `gl.vm.run_nondet` with a custom comparative validator: the validator reruns the judgment and must reach the same verdict and an overlapping cited clause. |

Layer 3 is fed **ground truth** from layers 1 and 2 and is explicitly forbidden
from contradicting it. Objective rules are also converted into Python
predicates by a model and evaluated inside `gl.vm.spawn_sandbox` with a starved
builtins map, so the model never gets to hallucinate a number that code can
verify.

---

## Lifecycle

```
create_bounty ──> submit_run ──> verify_run ──> [challenge window] ──> settle
   (payable)                          │                  │
   rules frozen                       │                  ▼
   + keccak256                        │           challenge_run (bonded)
                                      │                  │
                                      ▼                  ▼
                                  REJECTED      respond_to_challenge
                                                         │
                                                         ▼
                                                  judge_challenge
                                                         │
                                            UPHELD / DISMISSED / INCONCLUSIVE
```

### Settlement branches

| Situation | Outcome |
|---|---|
| Verified, window closed, no challenge | Prize to the runner |
| Challenge dismissed | Prize plus the forfeited bond to the runner |
| Challenge upheld | Bond returned, run overturned, prize stays in escrow |
| Challenge inconclusive | Bond returned, nobody punished, verdict downgraded to `UNCLEAR`, case waits for a human panel |
| `UNCLEAR` verdict | Never settles on its own. Requires the panel. |
| Evidence gone at settlement | Run rejected, challenger bond returned, nothing paid |

### One gate, every payout branch

Both branches that hand money to a runner go through a single function, and it
enforces two things before anything moves:

1. **The verdict is `COMPLIANT`.** Losing a challenge does not upgrade a
   verdict. Without this shared gate an `UNCLEAR` run could be walked past the
   human panel by arranging a challenge and losing it, which is a real hole that
   existed here until review caught it.
2. **The evidence is still public right now.** `settle` re-fetches rather than
   trusting the check made at verification time.

`INCONCLUSIVE` is a first class outcome on purpose. A contract that forces a
binary answer will eventually force a wrong one with somebody else's money. The
downgrade to `UNCLEAR` matters too: without it, a challenge serious enough to be
undecidable would quietly time out into a payout one window later.

---

## Project layout

```
contracts/speedrun_escrow.py   the Intelligent Contract
tests/direct/                  43 direct mode tests, about 1.8s
conftest.py                    Windows shim for the test harness
scripts/seed.mjs               open a bounty and submit runs
scripts/verify.mjs             run verification for pending runs on chain
lib/                           chain config, wallet adapter, contract bindings
components/                    UI
app/                           Next.js App Router
```

---

## Running it

### Frontend

```bash
npm install
npm run dev
```

Reads work with no wallet. The split auditor on the landing page is a live
`preview_audit` read call against the deployed contract.

### Contract

```bash
pip install genvm-linter genlayer-test cloudpickle pytest
genvm-lint check contracts/speedrun_escrow.py
pytest tests/direct -q
```

### Deploy your own

```bash
npm install -g genlayer
genlayer network set testnet-bradbury
genlayer account import --name dev --private-key 0x...
genlayer account use dev
genlayer deploy --contract contracts/speedrun_escrow.py --args 1 1000
```

The two constructor arguments are the challenge window in hours and the
challenge bond in basis points. This deployment uses `1` and `1000`, a one hour
window and a ten percent bond, so the full flow is demoable in a single sitting.
For production you would want `72`.

Put the resulting address in `.env.local` as `NEXT_PUBLIC_CONTRACT_ADDRESS`.

Fund the account first at the
[GenLayer faucet](https://testnet-faucet.genlayer.foundation/).

### Seed some data

```bash
cp .env.example .env.local   # then fill in the values
node scripts/seed.mjs        # opens a bounty and submits two runs
node scripts/verify.mjs      # judges every run still in SUBMITTED
```

`verify.mjs` is the slow one. Each call makes a live web request and two model
calls, then every validator repeats the work before comparing verdicts. Budget a
minute or more per run, and expect Bradbury to apply backpressure under load.
Both scripts back off and retry rather than dropping a transaction.

### A size ceiling worth knowing about

The contract source is transaction pubdata, and Bradbury rejects a deploy with
`BlockPubdataLimitReached` once it grows past roughly 53kB. This file sits just
under that, which is not much headroom. If a future change pushes it over, the
fix is either to trim prose or to split the contract across files using the
`py-genlayer-multi` runner. Measured by bisection: 50.8kB and 52.8kB deploy,
54.3kB does not.

---

## Deploying to Vercel

The repo is a standard Next.js 15 App Router project with no custom server, so
Vercel detects it with zero configuration.

1. Push the repo to GitHub.
2. Import it on Vercel. Framework preset is detected as Next.js.
3. Add one environment variable:
   `NEXT_PUBLIC_CONTRACT_ADDRESS = 0x39b24Ab5b04FfE2ED6dC89C41462e88b302fCe1F`
4. Deploy.

Do **not** set `DEPLOYER_PRIVATE_KEY` on Vercel. It is only used by the local
seed script. Browser signing happens entirely inside the user's wallet and the
frontend never handles a key.

---

## Wallet adapter

`lib/wallet.tsx` implements EIP-6963 multi injected provider discovery, so every
installed wallet is listed rather than assuming `window.ethereum` is MetaMask.
Connecting does three things:

1. `eth_requestAccounts`
2. `wallet_switchEthereumChain` to chain id 4221, falling back to
   `wallet_addEthereumChain` on error 4902
3. Builds a `genlayer-js` client with the address passed as a **string**

That last detail matters. When `account` is a string rather than an account
object, the SDK routes `eth_sendTransaction` to the injected provider instead of
trying to sign locally, which is what keeps the private key inside the wallet.

The app keeps two clients: a read client that always works without a wallet, and
a write client that only exists once connected.

---

## What the UI shows that a normal dapp does not

Transaction toasts render the **real GenLayer consensus ladder**, not a generic
spinner: `PENDING`, `PROPOSING`, `COMMITTING`, `REVEALING`, `ACCEPTED`,
`FINALIZED`. Optimistic Democracy is the reason this contract can exist, so the
interface shows it happening.

---

## Known limits

These are written down because a judgment system that oversells itself is worse
than no judgment system.

**Prompt injection is the sharpest edge.** The contract reads user controlled
text: run notes, video titles, rendered page content. Somebody will eventually
write instructions in there aimed at the model. Mitigations in place: known
markers are stripped, untrusted text is fenced and explicitly labelled as data,
only structured fields are extracted, and no single field decides a verdict
alone. Mitigation that does **not** work: multi validator consensus, because
every validator reads the same poisoned page. The bonded challenge window is the
real backstop.

**Evidence has to survive to settlement.** `settle` re-fetches the video before
any prize moves, so taking it down after verification does not get paid: the run
is rejected and any challenger bond goes home. What is still missing is an
archival snapshot, so a video that is edited rather than removed, or that goes
down and comes back around the settlement call, is not caught.

**No human panel is wired up.** `UNCLEAR` and `INCONCLUSIVE` park correctly and
refuse to pay out, which is the correct behaviour. The multisig that resolves
them is future work.

**Bradbury is a working testnet and behaves like one.** Under load the node
returns `pipeline backpressure` on submission, and consensus rounds can end in
`LEADER_TIMEOUT` or `VALIDATORS_TIMEOUT` before producing a verdict. Neither is a
verdict and neither changes contract state, so `verify_run` is safe to call
again. `scripts/verify.mjs` backs off on submission and re-runs the round up to
four times. The frontend settles each read independently with retries, so one
failed call cannot blank the page.

**Direct mode cannot exercise the sandbox.** `gltest` stubs out
`gl.vm.spawn_sandbox`, so the predicate evaluator is unit tested as a pure
function and the sandbox path is covered on chain instead. The contract treats an
unavailable sandbox as a degraded but survivable condition rather than a failure.

---

## Why GenLayer and not a backend with an API key

If the frontend already computed the answer, GenLayer would only be
rubber stamping it. That is not the case here. The judgment moves escrowed money,
the rules are natural language that cannot be reduced to `if` statements, and
multiple independent validators re-derive the verdict rather than trusting one
model call. The prize and the ruling are enforced by the same state machine, so
there is no moderator to trust and no wallet to run away with the pot.
