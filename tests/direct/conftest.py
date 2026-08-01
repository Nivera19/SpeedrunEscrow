import json
import sys

import pytest

CONTRACT = "contracts/speedrun_escrow.py"

GEN = 10**18

RULES = (
    "Timing starts on file select and ends on the final hit. "
    "Bottle adventure is banned. Wrong warp is banned. "
    "Emulator runs are allowed on default settings with no savestates. "
    "The run must be a single unedited segment."
)


@pytest.fixture
def escrow(direct_deploy):
    return direct_deploy(CONTRACT, 72, 1000)


def set_chain_time(direct_vm, iso):
    """
    Move the chain clock the contract actually reads.

    direct_vm.warp updates the harness clock, but this build of the harness does
    not propagate the new datetime into the cached gl.message_raw that contracts
    read, so the value has to be set on the module as well. Both are updated so
    the tests keep working once the harness catches up.
    """
    direct_vm.warp(iso)
    gl_module = sys.modules.get("genlayer.gl")
    if gl_module is not None and getattr(gl_module, "message_raw", None) is not None:
        gl_module.message_raw["datetime"] = iso


def mock_oembed(direct_vm, *, status=200, title="Any% in 33:12", author="runner"):
    body = json.dumps(
        {
            "title": title,
            "author_name": author,
            "provider_name": "YouTube",
            "thumbnail_url": "https://i.ytimg.com/vi/x/hq.jpg",
        }
    )
    direct_vm.mock_web(
        r".*youtube\.com/oembed.*",
        {"status": status, "body": body},
    )


def mock_page(direct_vm, text="Any% speedrun, single segment, no glitches used."):
    direct_vm.mock_web(r".*(youtube\.com/watch|youtu\.be).*", {"status": 200, "body": text})


def mock_checks(direct_vm, checks=None):
    payload = {"checks": checks if checks is not None else []}
    direct_vm.mock_llm(r".*Convert objective, mechanically checkable rules.*", json.dumps(payload))


def mock_verdict(direct_vm, verdict="COMPLIANT", cited_rule="", reason="Consistent with the rules."):
    direct_vm.mock_llm(
        r".*You are a speedrun verification judge.*",
        json.dumps({"verdict": verdict, "cited_rule": cited_rule, "reason": reason}),
    )


def mock_challenge(direct_vm, verdict="DISMISSED", specific=False, reason="No timestamp given."):
    direct_vm.mock_llm(
        r".*You are an appeals judge.*",
        json.dumps({"verdict": verdict, "specific": specific, "reason": reason}),
    )


def open_bounty(direct_vm, escrow, sponsor, prize=10 * GEN, deadline="2099-01-01T00:00:00Z"):
    direct_vm.sender = sponsor
    direct_vm.value = prize
    bounty_id = escrow.create_bounty(
        "The Legend of Zelda: Ocarina of Time",
        "Any%",
        "N64",
        RULES,
        "RTA",
        deadline,
    )
    direct_vm.value = 0
    return bounty_id
