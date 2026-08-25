from __future__ import annotations


def test_empty_claim_keeps_204_contract(monkeypatch):
    from api import worker_routes
    import flask

    app = flask.Flask("claim-conflict-tests")
    app.config["TESTING"] = True
    monkeypatch.setattr(worker_routes, "_get_worker_token_from_request", lambda: "token")
    worker_routes._claim_rate_limits.clear()
    monkeypatch.setattr(worker_routes, "_app_module", lambda: type("App", (), {
        "server_claim_next_execution": staticmethod(lambda **kwargs: (None, None, None)),
    })())
    monkeypatch.setattr("services.worker_registry.verify_token", lambda _: ("worker", {"name": "w"}))
    monkeypatch.setattr("services.worker_registry.update_worker_heartbeat", lambda *args, **kwargs: None)
    with app.test_request_context("/api/worker/claim", method="POST", json={}):
        response = worker_routes.api_worker_claim.__wrapped__()
    assert response[1] == 204


def test_claim_conflict_returns_409_marker(monkeypatch):
    from api import worker_routes
    import flask

    app = flask.Flask("claim-conflict-tests")
    app.config["TESTING"] = True
    monkeypatch.setattr(worker_routes, "_get_worker_token_from_request", lambda: "token")
    worker_routes._claim_rate_limits.clear()
    monkeypatch.setattr(worker_routes, "_app_module", lambda: type("App", (), {
        "server_claim_next_execution": staticmethod(lambda **kwargs: (None, None, None, True)),
    })())
    monkeypatch.setattr("services.worker_registry.verify_token", lambda _: ("worker", {"name": "w"}))
    monkeypatch.setattr("services.worker_registry.update_worker_heartbeat", lambda *args, **kwargs: None)
    with app.test_request_context("/api/worker/claim", method="POST", json={}):
        response = worker_routes.api_worker_claim.__wrapped__()
    assert response[1] == 409
    assert response[0].get_json()["error"] == "claim_conflict"
    assert response[2]["Retry-After"] == "1"
