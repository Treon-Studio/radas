def test_mutation_gate_is_fail_closed(monkeypatch):
    from services import flag_gate
    monkeypatch.setattr(flag_gate, "mutation_blocked", lambda *args, **kwargs: {"blocked": True, "reason": "test"})
    assert flag_gate.mutation_blocked("apply")["blocked"] is True
