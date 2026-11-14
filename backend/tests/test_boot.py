"""Boot probe: the sequenced readiness checks the console runs on first load."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_boot_reports_real_stages(client: TestClient, loaded_fixture: dict) -> None:
    response = client.get("/api/v1/system/boot")
    assert response.status_code == 200

    body = response.json()
    assert body["ok"] is True, body["stages"]
    assert body["duration_ms"] >= 0

    stages = {stage["key"]: stage for stage in body["stages"]}
    assert [stage["key"] for stage in body["stages"]] == [
        "platform",
        "fireseal",
        "harmonization",
        "data",
    ]
    assert all(stage["ok"] for stage in body["stages"]), body["stages"]

    # Platform names the running engine and its database.
    platform = stages["platform"]["metrics"]
    assert platform["dialect"] in {"postgresql", "sqlite"}
    assert platform["modules"] > 0

    # FireSeal proves the payloads really live in compressed blocks.
    fireseal = stages["fireseal"]["metrics"]
    assert fireseal["raw_rows"] == loaded_fixture["inserted"]
    assert fireseal["block_pointers"] == fireseal["raw_rows"]
    assert fireseal["inline_payloads"] == 0
    assert fireseal["blocks"] >= 1
    assert fireseal["rows_in_blocks"] >= fireseal["raw_rows"]

    # Harmonization reports the audit trail, not a guess.
    assert "algorithm_version" in stages["harmonization"]["metrics"]

    # Data stage reconciles with the stored detections.
    assert stages["data"]["metrics"]["observations_stored"] == loaded_fixture["inserted"]


def test_boot_is_public(client: TestClient) -> None:
    """The boot sequence runs before login, so it must not require a session."""
    response = client.get("/api/v1/system/boot")
    assert response.status_code == 200
    assert "stages" in response.json()

def test_boot_can_run_one_stage(client: TestClient, loaded_fixture: dict) -> None:
    """The console sequences the stages; each is a separate, real request."""
    response = client.get("/api/v1/system/boot", params={"stage": "fireseal"})
    assert response.status_code == 200

    body = response.json()
    assert [stage["key"] for stage in body["stages"]] == ["fireseal"]
    assert body["stages"][0]["ok"] is True

    unknown = client.get("/api/v1/system/boot", params={"stage": "nope"})
    assert unknown.status_code == 400
    assert unknown.json()["error"]["code"] == "bad_request"