import json
import sys

from conftest import (
    GEN,
    RULES,
    mock_challenge,
    mock_checks,
    mock_oembed,
    mock_page,
    mock_verdict,
    open_bounty,
    set_chain_time,
)

VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


# ---------------------------------------------------------------------------
# Deterministic arithmetic. No consensus, no model, same answer on every node.
# ---------------------------------------------------------------------------


def test_split_audit_accepts_matching_splits(escrow):
    audit = escrow.preview_audit(600000, json.dumps([200000, 200000, 200000]))
    assert audit["provided"] is True
    assert audit["segments"] == 3
    assert audit["sum_ms"] == 600000
    assert audit["consistent"] is True


def test_split_audit_flags_mismatch(escrow):
    audit = escrow.preview_audit(600000, json.dumps([200000, 200000, 100000]))
    assert audit["consistent"] is False
    assert audit["delta_ms"] == 100000


def test_split_audit_tolerates_two_frames(escrow):
    audit = escrow.preview_audit(600000, json.dumps([300000, 300030]))
    assert audit["delta_ms"] == 30
    assert audit["consistent"] is True


def test_split_audit_rejects_negative_segment(escrow):
    audit = escrow.preview_audit(100000, json.dumps([200000, -100000]))
    assert audit["negative_segment"] is True
    assert audit["consistent"] is False


def test_split_audit_handles_garbage(escrow):
    audit = escrow.preview_audit(600000, "not json at all")
    assert audit["provided"] is False
    assert audit["consistent"] is False


# ---------------------------------------------------------------------------
# Bounty creation and frozen rules
# ---------------------------------------------------------------------------


def test_create_bounty_freezes_rules(direct_vm, escrow, direct_alice):
    bounty_id = open_bounty(direct_vm, escrow, direct_alice)
    bounty = escrow.get_bounty(bounty_id)

    assert bounty["status"] == "OPEN"
    assert bounty["rules_text"] == RULES
    assert bounty["rules_hash"].startswith("0x")
    assert len(bounty["rules_hash"]) == 66
    assert bounty["prize_atto"] == str(10 * GEN)
    assert bounty["required_bond_atto"] == str(GEN)


def test_create_bounty_requires_prize(direct_vm, escrow, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.value = 0
    with direct_vm.expect_revert("Prize must be greater than zero"):
        escrow.create_bounty("Game", "Any%", "PC", RULES, "RTA", "2099-01-01T00:00:00Z")


def test_create_bounty_rejects_thin_rules(direct_vm, escrow, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.value = GEN
    with direct_vm.expect_revert("Rules text is too short"):
        escrow.create_bounty("Game", "Any%", "PC", "go fast", "RTA", "2099-01-01T00:00:00Z")


# ---------------------------------------------------------------------------
# Submission
# ---------------------------------------------------------------------------


def test_submit_run_stores_everything(direct_vm, escrow, direct_alice, direct_bob):
    bounty_id = open_bounty(direct_vm, escrow, direct_alice)

    direct_vm.sender = direct_bob
    run_id = escrow.submit_run(bounty_id, VIDEO, 1992340, json.dumps([1000000, 992340]), "Clean run.")

    run = escrow.get_run(run_id)
    assert run["status"] == "SUBMITTED"
    assert run["verdict"] == "NONE"
    assert run["claimed_time"] == "00:33:12.340"
    assert escrow.list_run_ids(bounty_id) == [run_id]
    assert escrow.get_bounty(bounty_id)["run_count"] == 1


def test_submit_run_rejects_http(direct_vm, escrow, direct_alice, direct_bob):
    bounty_id = open_bounty(direct_vm, escrow, direct_alice)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Video URL must be https"):
        escrow.submit_run(bounty_id, "http://example.com/v", 100, "[]", "")


def test_submit_run_rejects_after_deadline(direct_vm, escrow, direct_alice, direct_bob):
    bounty_id = open_bounty(direct_vm, escrow, direct_alice, deadline="2020-01-01T00:00:00Z")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Bounty deadline has passed"):
        escrow.submit_run(bounty_id, VIDEO, 100, "[]", "")


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------


def _submit(direct_vm, escrow, bounty_id, runner, notes="Standard route, no glitches."):
    direct_vm.sender = runner
    return escrow.submit_run(bounty_id, VIDEO, 1992340, json.dumps([1000000, 992340]), notes)


def test_verify_run_compliant_opens_challenge_window(
    direct_vm, escrow, direct_alice, direct_bob
):
    bounty_id = open_bounty(direct_vm, escrow, direct_alice)
    run_id = _submit(direct_vm, escrow, bounty_id, direct_bob)

    mock_oembed(direct_vm)
    mock_page(direct_vm)
    mock_checks(direct_vm)
    mock_verdict(direct_vm, "COMPLIANT")

    assert escrow.verify_run(run_id) == "COMPLIANT"

    run = escrow.get_run(run_id)
    assert run["status"] == "VERIFIED"
    assert run["challenge_deadline"] != ""
    assert escrow.get_stats()["verified"] == 1


def test_verify_run_violation_rejects(direct_vm, escrow, direct_alice, direct_bob):
    bounty_id = open_bounty(
        direct_vm, escrow, direct_alice
    )
    run_id = _submit(direct_vm, escrow, bounty_id, direct_bob, "Used a bottle adventure at 12:30.")

    mock_oembed(direct_vm)
    mock_page(direct_vm)
    mock_checks(direct_vm)
    mock_verdict(direct_vm, "VIOLATION", "Bottle adventure is banned.", "The runner declared a banned glitch.")

    assert escrow.verify_run(run_id) == "VIOLATION"

    run = escrow.get_run(run_id)
    assert run["status"] == "REJECTED"
    assert "Bottle adventure" in json.loads(run["evidence_json"])["cited_rule"]
    assert escrow.get_stats()["rejected"] == 1


def test_verify_run_rejects_unreachable_evidence(
    direct_vm, escrow, direct_alice, direct_bob
):
    bounty_id = open_bounty(direct_vm, escrow, direct_alice)
    run_id = _submit(direct_vm, escrow, bounty_id, direct_bob)

    mock_oembed(direct_vm, status=404)

    assert escrow.verify_run(run_id) == "VIOLATION"
    run = escrow.get_run(run_id)
    assert run["status"] == "REJECTED"
    assert "not publicly reachable" in run["verdict_reason"]


def test_verify_run_unclear_does_not_reject(direct_vm, escrow, direct_alice, direct_bob):
    bounty_id = open_bounty(direct_vm, escrow, direct_alice)
    run_id = _submit(direct_vm, escrow, bounty_id, direct_bob, "")

    mock_oembed(direct_vm)
    mock_page(direct_vm)
    mock_checks(direct_vm)
    mock_verdict(direct_vm, "UNCLEAR", "", "Not enough information without the footage.")

    assert escrow.verify_run(run_id) == "UNCLEAR"
    run = escrow.get_run(run_id)
    assert run["status"] == "VERIFIED"
    assert escrow.get_stats()["rejected"] == 0


def test_generated_predicates_are_evaluated_against_verified_facts(escrow):
    """
    Direct mode stubs out gl.vm.spawn_sandbox instead of running it, so the
    predicate evaluator is exercised here as a pure function. The sandbox path
    itself is covered by the integration suite.
    """
    module = sys.modules["_contract_speedrun_escrow"]

    facts = {
        "claimed_ms": 1992340,
        "split_count": 2,
        "splits_reconcile": True,
        "platform": "N64",
        "timing_method": "RTA",
    }
    results = module._eval_checks(
        [
            {"rule": "under 40 minutes", "expression": "claimed_ms < 2400000"},
            {"rule": "under 30 minutes", "expression": "claimed_ms < 1800000"},
            {"rule": "splits must line up", "expression": "splits_reconcile"},
            {"rule": "original hardware", "expression": "platform == 'N64'"},
            {"rule": "broken on purpose", "expression": "this is not python"},
            {"rule": "escape attempt", "expression": "__import__('os').getcwd()"},
        ],
        facts,
    )

    labels = {item["rule"]: item["result"] for item in results}
    assert labels["under 40 minutes"] == "SATISFIED"
    assert labels["under 30 minutes"] == "VIOLATED"
    assert labels["splits must line up"] == "SATISFIED"
    assert labels["original hardware"] == "SATISFIED"
    # A malformed expression is dropped, never allowed to fail somebody's run.
    assert "broken on purpose" not in labels
    # Builtins are starved, so an import based escape simply does not evaluate.
    assert "escape attempt" not in labels


def test_expressions_are_rejected_unless_every_name_is_a_verified_fact(escrow):
    """
    The failure this guards against actually happened on Bradbury. A generated
    predicate for "the run must be a single unedited segment" reached for the
    split count, read it as a count of video segments, and rejected an honest
    run. Only names the contract verified are allowed through.
    """
    module = sys.modules["_contract_speedrun_escrow"]
    allowed = {
        "claimed_ms",
        "split_count",
        "splits_reconcile",
        "platform",
    } | module._EXPRESSION_ALLOWED_NAMES

    ok = [
        "claimed_ms < 2400000",
        "splits_reconcile and claimed_ms > 0",
        "platform.lower() == 'n64'",
        "not splits_reconcile",
    ]
    for expression in ok:
        assert module._expression_is_safe(expression, allowed), expression

    rejected = [
        # Invented facts the contract never computed.
        "video_segments == 1",
        "is_single_segment",
        "uses_savestates == False",
        "game_version == '1.0'",
        # Escape attempts.
        "__import__('os').system('ls')",
        "(lambda: 1)()",
        "open('/etc/passwd').read()",
    ]
    for expression in rejected:
        assert not module._expression_is_safe(expression, allowed), expression


def test_verification_survives_an_unavailable_sandbox(
    direct_vm, escrow, direct_alice, direct_bob
):
    bounty_id = open_bounty(direct_vm, escrow, direct_alice)
    run_id = _submit(direct_vm, escrow, bounty_id, direct_bob)

    mock_oembed(direct_vm)
    mock_page(direct_vm)
    mock_checks(
        direct_vm,
        [{"rule": "under 40 minutes", "expression": "claimed_ms < 2400000"}],
    )
    mock_verdict(direct_vm, "COMPLIANT")

    # The generated checks degrade to nothing, the deterministic audit does not.
    assert escrow.verify_run(run_id) == "COMPLIANT"
    evidence = json.loads(escrow.get_run(run_id)["evidence_json"])
    assert evidence["checks"] == []
    assert evidence["audit"]["consistent"] is True


def test_verify_run_twice_is_refused(direct_vm, escrow, direct_alice, direct_bob):
    bounty_id = open_bounty(direct_vm, escrow, direct_alice)
    run_id = _submit(direct_vm, escrow, bounty_id, direct_bob)

    mock_oembed(direct_vm)
    mock_page(direct_vm)
    mock_checks(direct_vm)
    mock_verdict(direct_vm, "COMPLIANT")
    escrow.verify_run(run_id)

    with direct_vm.expect_revert("Run is not awaiting verification"):
        escrow.verify_run(run_id)


# ---------------------------------------------------------------------------
# Challenges
# ---------------------------------------------------------------------------


def _verified_run(direct_vm, escrow, sponsor, runner, verdict="COMPLIANT"):
    bounty_id = open_bounty(direct_vm, escrow, sponsor)
    run_id = _submit(direct_vm, escrow, bounty_id, runner)
    mock_oembed(direct_vm)
    mock_page(direct_vm)
    mock_checks(direct_vm)
    mock_verdict(direct_vm, verdict)
    escrow.verify_run(run_id)
    return bounty_id, run_id


def _challenge(direct_vm, escrow, run_id, challenger, claim=None):
    direct_vm.sender = challenger
    direct_vm.value = GEN
    escrow.challenge_run(run_id, claim or SPECIFIC_CLAIM)
    direct_vm.value = 0


SPECIFIC_CLAIM = (
    "At 12:34 the audio waveform cuts mid room transition, which is inconsistent "
    "with a single unedited segment as the rules require."
)


def test_challenge_requires_bond(direct_vm, escrow, direct_alice, direct_bob, direct_charlie):
    _, run_id = _verified_run(direct_vm, escrow, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    direct_vm.value = 1
    with direct_vm.expect_revert("Bond is below the required amount"):
        escrow.challenge_run(run_id, SPECIFIC_CLAIM)


def test_challenge_requires_specific_claim(
    direct_vm, escrow, direct_alice, direct_bob, direct_charlie
):
    _, run_id = _verified_run(direct_vm, escrow, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    direct_vm.value = GEN
    with direct_vm.expect_revert("Claim must be specific"):
        escrow.challenge_run(run_id, "fake run")


def test_runner_cannot_challenge_itself(direct_vm, escrow, direct_alice, direct_bob):
    _, run_id = _verified_run(direct_vm, escrow, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    direct_vm.value = GEN
    with direct_vm.expect_revert("A runner cannot challenge itself"):
        escrow.challenge_run(run_id, SPECIFIC_CLAIM)


def test_vague_challenge_is_dismissed_and_bond_is_forfeited(
    direct_vm, escrow, direct_alice, direct_bob, direct_charlie
):
    _, run_id = _verified_run(direct_vm, escrow, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    direct_vm.value = GEN
    escrow.challenge_run(run_id, SPECIFIC_CLAIM)
    direct_vm.value = 0

    assert escrow.get_run(run_id)["status"] == "CHALLENGED"

    mock_challenge(direct_vm, "DISMISSED", specific=False)
    assert escrow.judge_challenge(run_id) == "DISMISSED"

    assert escrow.settle(run_id) == "PAID_RUNNER_BOND_FORFEITED"
    run = escrow.get_run(run_id)
    assert run["status"] == "SETTLED"
    assert escrow.get_bounty(run["bounty_id"])["winner_run_id"] == run_id


def test_upheld_challenge_overturns_the_run(
    direct_vm, escrow, direct_alice, direct_bob, direct_charlie
):
    _, run_id = _verified_run(direct_vm, escrow, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    direct_vm.value = GEN
    escrow.challenge_run(run_id, SPECIFIC_CLAIM)
    direct_vm.value = 0

    direct_vm.sender = direct_bob
    escrow.respond_to_challenge(run_id, "The transition is a load, not a cut.")

    mock_challenge(direct_vm, "UPHELD", specific=True, reason="The cut is documented.")
    assert escrow.judge_challenge(run_id) == "UPHELD"

    assert escrow.settle(run_id) == "RUN_OVERTURNED_BOND_RETURNED"
    run = escrow.get_run(run_id)
    assert run["status"] == "REJECTED"
    # The prize stays in escrow for the next submission.
    assert escrow.get_bounty(run["bounty_id"])["status"] == "OPEN"


def test_inconclusive_challenge_escalates_without_punishing_anyone(
    direct_vm, escrow, direct_alice, direct_bob, direct_charlie
):
    _, run_id = _verified_run(direct_vm, escrow, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    direct_vm.value = GEN
    escrow.challenge_run(run_id, SPECIFIC_CLAIM)
    direct_vm.value = 0

    mock_challenge(direct_vm, "INCONCLUSIVE", specific=True, reason="Needs the footage.")
    assert escrow.judge_challenge(run_id) == "INCONCLUSIVE"

    assert escrow.settle(run_id) == "ESCALATED_BOND_RETURNED"
    run = escrow.get_run(run_id)
    assert run["status"] == "VERIFIED"
    assert run["bond_atto"] == "0"
    # Downgraded so the run cannot quietly time out into a payout.
    assert run["verdict"] == "UNCLEAR"
    assert escrow.get_stats()["verified"] == 0


def test_inconclusive_run_cannot_time_out_into_a_payout(
    direct_vm, escrow, direct_alice, direct_bob, direct_charlie
):
    set_chain_time(direct_vm, "2026-01-01T00:00:00Z")
    _, run_id = _verified_run(direct_vm, escrow, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    direct_vm.value = GEN
    escrow.challenge_run(run_id, SPECIFIC_CLAIM)
    direct_vm.value = 0

    mock_challenge(direct_vm, "INCONCLUSIVE", specific=True)
    escrow.judge_challenge(run_id)
    escrow.settle(run_id)

    set_chain_time(direct_vm, "2026-01-08T00:00:00Z")
    with direct_vm.expect_revert("needs a human panel"):
        escrow.settle(run_id)


def test_a_new_challenge_clears_the_previous_rebuttal(
    direct_vm, escrow, direct_alice, direct_bob, direct_charlie
):
    set_chain_time(direct_vm, "2026-01-01T00:00:00Z")
    _, run_id = _verified_run(direct_vm, escrow, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    direct_vm.value = GEN
    escrow.challenge_run(run_id, SPECIFIC_CLAIM)
    direct_vm.value = 0

    direct_vm.sender = direct_bob
    escrow.respond_to_challenge(run_id, "That is a load, not a cut.")
    assert escrow.get_run(run_id)["rebuttal"] != ""

    mock_challenge(direct_vm, "INCONCLUSIVE", specific=True)
    escrow.judge_challenge(run_id)
    escrow.settle(run_id)

    direct_vm.sender = direct_charlie
    direct_vm.value = GEN
    escrow.challenge_run(
        run_id,
        "The version string in the title screen reads 1.1 and the rules require 1.0 exactly.",
    )
    direct_vm.value = 0

    run = escrow.get_run(run_id)
    # A reply to the old accusation is not an answer to the new one.
    assert run["rebuttal"] == ""
    assert run["challenge_reason"] == ""
    assert run["challenge_verdict"] == "NONE"


def test_challenge_cannot_be_judged_twice(
    direct_vm, escrow, direct_alice, direct_bob, direct_charlie
):
    _, run_id = _verified_run(direct_vm, escrow, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    direct_vm.value = GEN
    escrow.challenge_run(run_id, SPECIFIC_CLAIM)
    direct_vm.value = 0

    mock_challenge(direct_vm, "DISMISSED")
    escrow.judge_challenge(run_id)

    with direct_vm.expect_revert("Challenge was already judged"):
        escrow.judge_challenge(run_id)


# ---------------------------------------------------------------------------
# Settlement
# ---------------------------------------------------------------------------


def test_settle_waits_for_the_challenge_window(
    direct_vm, escrow, direct_alice, direct_bob
):
    _, run_id = _verified_run(direct_vm, escrow, direct_alice, direct_bob)

    with direct_vm.expect_revert("Challenge window is still open"):
        escrow.settle(run_id)


def test_settle_pays_the_runner_after_the_window(
    direct_vm, escrow, direct_alice, direct_bob
):
    set_chain_time(direct_vm, "2026-01-01T00:00:00Z")
    _, run_id = _verified_run(direct_vm, escrow, direct_alice, direct_bob)

    set_chain_time(direct_vm, "2026-01-08T00:00:00Z")
    assert escrow.settle(run_id) == "PAID_RUNNER"

    run = escrow.get_run(run_id)
    assert run["status"] == "SETTLED"
    assert escrow.get_stats()["paid_atto"] == str(10 * GEN)


def test_unclear_run_never_pays_out_on_its_own(
    direct_vm, escrow, direct_alice, direct_bob
):
    set_chain_time(direct_vm, "2026-01-01T00:00:00Z")
    bounty_id = open_bounty(direct_vm, escrow, direct_alice)
    run_id = _submit(direct_vm, escrow, bounty_id, direct_bob)

    mock_oembed(direct_vm)
    mock_page(direct_vm)
    mock_checks(direct_vm)
    mock_verdict(direct_vm, "UNCLEAR")
    escrow.verify_run(run_id)

    set_chain_time(direct_vm, "2026-01-08T00:00:00Z")
    with direct_vm.expect_revert("needs a human panel"):
        escrow.settle(run_id)


# ---------------------------------------------------------------------------
# Every payout branch shares one gate
#
# A dismissed challenge used to pay out without rechecking the verdict, which
# turned the challenge system into a way around the human panel: get UNCLEAR,
# arrange a challenge, lose it, collect the prize.
# ---------------------------------------------------------------------------


def test_unclear_run_cannot_be_paid_by_losing_a_challenge(
    direct_vm, escrow, direct_alice, direct_bob, direct_charlie
):
    _, run_id = _verified_run(
        direct_vm, escrow, direct_alice, direct_bob, verdict="UNCLEAR"
    )
    assert escrow.get_run(run_id)["status"] == "VERIFIED"

    _challenge(direct_vm, escrow, run_id, direct_charlie)
    mock_challenge(direct_vm, "DISMISSED", specific=False)
    assert escrow.judge_challenge(run_id) == "DISMISSED"

    with direct_vm.expect_revert("needs a human panel"):
        escrow.settle(run_id)

    assert escrow.get_stats()["paid_atto"] == "0"


def test_post_inconclusive_run_cannot_be_paid_by_losing_a_second_challenge(
    direct_vm, escrow, direct_alice, direct_bob, direct_charlie
):
    set_chain_time(direct_vm, "2026-01-01T00:00:00Z")
    _, run_id = _verified_run(direct_vm, escrow, direct_alice, direct_bob)

    # First challenge cannot be decided, so the verdict drops to UNCLEAR.
    _challenge(direct_vm, escrow, run_id, direct_charlie)
    mock_challenge(direct_vm, "INCONCLUSIVE", specific=True)
    escrow.judge_challenge(run_id)
    assert escrow.settle(run_id) == "ESCALATED_BOND_RETURNED"
    assert escrow.get_run(run_id)["verdict"] == "UNCLEAR"

    # A second challenge that fails must not restore the payout. The earlier
    # mock has to go first: mocks match in registration order, so the round one
    # INCONCLUSIVE reply would otherwise answer round two as well.
    _challenge(direct_vm, escrow, run_id, direct_charlie)
    direct_vm.clear_mocks()
    mock_challenge(direct_vm, "DISMISSED", specific=False)
    assert escrow.judge_challenge(run_id) == "DISMISSED"

    with direct_vm.expect_revert("needs a human panel"):
        escrow.settle(run_id)

    assert escrow.get_stats()["paid_atto"] == "0"


def test_dismissed_challenge_still_pays_a_compliant_run(
    direct_vm, escrow, direct_alice, direct_bob, direct_charlie
):
    _, run_id = _verified_run(direct_vm, escrow, direct_alice, direct_bob)
    _challenge(direct_vm, escrow, run_id, direct_charlie)

    mock_challenge(direct_vm, "DISMISSED", specific=False)
    escrow.judge_challenge(run_id)

    mock_oembed(direct_vm)
    assert escrow.settle(run_id) == "PAID_RUNNER_BOND_FORFEITED"
    assert escrow.get_stats()["paid_atto"] == str(10 * GEN)


# ---------------------------------------------------------------------------
# Evidence has to survive to settlement, not only to verification
# ---------------------------------------------------------------------------


def test_payout_is_refused_when_the_evidence_was_taken_down(
    direct_vm, escrow, direct_alice, direct_bob
):
    set_chain_time(direct_vm, "2026-01-01T00:00:00Z")
    _, run_id = _verified_run(direct_vm, escrow, direct_alice, direct_bob)
    set_chain_time(direct_vm, "2026-01-08T00:00:00Z")

    # The runner makes the video private after being verified.
    direct_vm.clear_mocks()
    mock_oembed(direct_vm, status=401)

    assert escrow.settle(run_id) == "REJECTED_EVIDENCE_GONE"

    run = escrow.get_run(run_id)
    assert run["status"] == "REJECTED"
    assert "no longer public" in run["verdict_reason"]
    assert escrow.get_stats()["paid_atto"] == "0"


def test_a_taken_down_video_returns_the_challenger_bond(
    direct_vm, escrow, direct_alice, direct_bob, direct_charlie
):
    _, run_id = _verified_run(direct_vm, escrow, direct_alice, direct_bob)
    _challenge(direct_vm, escrow, run_id, direct_charlie)

    mock_challenge(direct_vm, "DISMISSED", specific=False)
    escrow.judge_challenge(run_id)

    direct_vm.clear_mocks()
    mock_oembed(direct_vm, status=404)

    assert escrow.settle(run_id) == "REJECTED_EVIDENCE_GONE"
    run = escrow.get_run(run_id)
    # The challenger doubted the run and the evidence then vanished. Forfeiting
    # the bond on top of that would be the wrong way round.
    assert run["bond_atto"] == "0"
    assert escrow.get_stats()["paid_atto"] == "0"


def test_evidence_still_public_at_settlement_pays_normally(
    direct_vm, escrow, direct_alice, direct_bob
):
    set_chain_time(direct_vm, "2026-01-01T00:00:00Z")
    _, run_id = _verified_run(direct_vm, escrow, direct_alice, direct_bob)
    set_chain_time(direct_vm, "2026-01-08T00:00:00Z")

    mock_oembed(direct_vm)
    assert escrow.settle(run_id) == "PAID_RUNNER"
    assert escrow.get_stats()["paid_atto"] == str(10 * GEN)


def test_sponsor_can_refund_after_deadline(direct_vm, escrow, direct_alice):
    set_chain_time(direct_vm, "2026-01-01T00:00:00Z")
    bounty_id = open_bounty(direct_vm, escrow, direct_alice, deadline="2026-02-01T00:00:00Z")

    set_chain_time(direct_vm, "2026-03-01T00:00:00Z")
    direct_vm.sender = direct_alice
    assert escrow.refund_bounty(bounty_id) == "REFUNDED"
    assert escrow.get_bounty(bounty_id)["status"] == "REFUNDED"


def test_refund_is_blocked_while_a_run_is_pending(
    direct_vm, escrow, direct_alice, direct_bob
):
    set_chain_time(direct_vm, "2026-01-01T00:00:00Z")
    bounty_id = open_bounty(direct_vm, escrow, direct_alice, deadline="2026-02-01T00:00:00Z")
    _submit(direct_vm, escrow, bounty_id, direct_bob)

    set_chain_time(direct_vm, "2026-03-01T00:00:00Z")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Runs are still awaiting a decision"):
        escrow.refund_bounty(bounty_id)


def test_only_sponsor_can_refund(direct_vm, escrow, direct_alice, direct_bob):
    set_chain_time(direct_vm, "2026-01-01T00:00:00Z")
    bounty_id = open_bounty(direct_vm, escrow, direct_alice, deadline="2026-02-01T00:00:00Z")

    set_chain_time(direct_vm, "2026-03-01T00:00:00Z")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the sponsor can refund"):
        escrow.refund_bounty(bounty_id)
