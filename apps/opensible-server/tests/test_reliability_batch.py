from __future__ import annotations
import time

def test_scheduled_test_run_timeout_and_warning(monkeypatch, data_dir):
    from services import test_cases
    tc=test_cases.create_test_case({"name":"scheduled","stack":"demo","kind":"assertion","assertions":["missing_tags"],"schedule":"*/5 * * * *"},"project")
    monkeypatch.setattr(test_cases,"run_test_case",lambda project_id,test_id:{"test_id":test_id,"passed":False,"findings":[{"severity":"warning"}]})
    result=test_cases.run_scheduled_tests("project",now=int(time.time()),timeout_seconds=1)
    assert result["count"]==1 and result["results"][0]["warning_notification"]["queued"] is True

def test_blocker_failure_queues_notification(monkeypatch, data_dir):
    from services import test_cases
    tc = test_cases.create_test_case({"name": "blocker", "stack": "demo", "assertions": ["cidr_public"], "severity": "blocker", "schedule": "* * * * *"}, "project")
    monkeypatch.setattr(test_cases, "_stack_texts", lambda project_id, stack: {"tfvars": "0.0.0.0/0"})
    sent = []
    monkeypatch.setattr("services.webhook_dispatcher.dispatch_event", lambda event, payload: sent.append((event, payload)) or 1)
    result = test_cases.run_scheduled_tests("project", now=int(time.time()), timeout_seconds=1)
    assert result["results"][0]["blocker_notification"]["queued"] is True
    assert sent[0][0] == "test.blocker_failed"


def test_flag_gate_fails_closed(monkeypatch):
    from services.flag_gate import mutation_blocked
    import services.feature_flag_registry as registry
    monkeypatch.setattr(registry,"evaluate",lambda *a,**k: (_ for _ in ()).throw(RuntimeError("broken")))
    assert mutation_blocked("apply")["blocked"] is True
