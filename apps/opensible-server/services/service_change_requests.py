"""Reviewable, tenant-scoped service revision change requests."""
from __future__ import annotations
import hashlib, json, time, uuid
from collections.abc import Mapping
from typing import Any
from psycopg.types.json import Jsonb
from api.platform_contracts import redact_sensitive
from storage import pg

class ChangeRequestError(ValueError): pass

def _instance(project_id, instance_id, actor_id, mutate=False):
    row=pg.query_one("SELECT * FROM service_instances WHERE id=%s AND project_id=%s",(instance_id,project_id))
    if not row: raise ChangeRequestError("service instance not found")
    member=pg.query_one("SELECT role FROM org_members WHERE org_id=%s AND user_id=%s",(row["org_id"],actor_id)) if actor_id else None
    if not member or (mutate and member["role"] not in {"owner","admin"}): raise ChangeRequestError("project access denied")
    return row

def _redact(value): return redact_sensitive(value)
def _diff(before, after):
    out={}
    for key in sorted(set(before) | set(after)):
        if before.get(key)!=after.get(key): out[key]={"before":_redact(before.get(key)),"after":_redact(after.get(key))}
    return out

def create(project_id, instance_id, actor_id, spec: Mapping[str,Any], key: str|None=None):
    instance=_instance(project_id,instance_id,actor_id); current=pg.query_one("SELECT * FROM service_revisions WHERE id=%s AND instance_id=%s",(instance.get("desired_revision_id"),instance_id)) or {}
    before=current.get("redacted_spec") or {}; after=dict(spec); diff=_diff(before,after); fingerprint=hashlib.sha256(json.dumps(_redact(after),sort_keys=True).encode()).hexdigest()
    existing=pg.query_one("SELECT * FROM service_change_requests WHERE project_id=%s AND instance_id=%s AND fingerprint=%s",(project_id,instance_id,fingerprint))
    if existing:return dict(existing)
    now=time.time(); risk={"level":"high" if instance.get("environment")=="production" else "low","irreversible": instance.get("environment")=="production"}; policy={"production_approval_required":instance.get("environment")=="production","passed":True}
    return dict(pg.query_one("INSERT INTO service_change_requests (id,org_id,project_id,instance_id,revision_id,source_revision,fingerprint,before_spec,after_spec,diff,risk,policy_results,status,requested_by,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'open',%s,%s,%s) RETURNING *",(str(uuid.uuid4()),instance["org_id"],project_id,instance_id,current.get("id") or "",None,fingerprint,Jsonb(_redact(before)),Jsonb(_redact(after)),Jsonb(diff),Jsonb(risk),Jsonb(policy),actor_id,now,now)))

def get(project_id,instance_id,request_id,actor_id):
    _instance(project_id,instance_id,actor_id); row=pg.query_one("SELECT * FROM service_change_requests WHERE id=%s AND project_id=%s AND instance_id=%s",(request_id,project_id,instance_id));
    if not row: raise ChangeRequestError("change request not found")
    row=dict(row); row["decisions"]=pg.query_all("SELECT decision,actor_id,note,created_at FROM service_change_decisions WHERE request_id=%s ORDER BY created_at",(request_id,)); return row

def decide(project_id,instance_id,request_id,actor_id,decision,note=""):
    _instance(project_id,instance_id,actor_id,True); row=get(project_id,instance_id,request_id,actor_id)
    if row["status"]!="open": raise ChangeRequestError("change request is not open")
    now=time.time(); pg.execute("INSERT INTO service_change_decisions (id,request_id,decision,actor_id,note,created_at) VALUES (%s,%s,%s,%s,%s,%s)",(str(uuid.uuid4()),request_id,decision,actor_id,_redact(note),now)); status=decision
    return dict(pg.query_one(f"UPDATE service_change_requests SET status=%s,approved_by=%s,updated_at=%s WHERE id=%s RETURNING *",(status,actor_id,now,request_id)))
