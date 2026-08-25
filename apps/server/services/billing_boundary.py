"""Billing-provider-neutral organization plans and quota lifecycle."""
from __future__ import annotations
import time, uuid
from typing import Any
from psycopg.types.json import Jsonb
from storage import pg
PLANS={"free":{"max_cpu_millicores":1000,"max_memory_mb":2048,"max_storage_gb":20},"team":{"max_cpu_millicores":10000,"max_memory_mb":32768,"max_storage_gb":500},"enterprise":{"max_cpu_millicores":100000,"max_memory_mb":524288,"max_storage_gb":10000}}
class BillingError(ValueError):pass
def _member(org,actor,mutate=False):
 row=pg.query_one("SELECT role FROM org_members WHERE org_id=%s AND user_id=%s",(org,actor)) if actor else None
 if not row or (mutate and row["role"] not in {"owner","admin"}):raise BillingError("organization access denied")
 return row
def get(org,actor):
 _member(org,actor); row=pg.query_one("SELECT * FROM org_billing_plans WHERE org_id=%s",(org,)); return dict(row) if row else {"plan_id":"free","limits":PLANS["free"],"state":"active"}
def assign(org,actor,plan):
 _member(org,actor,True); plan=str(plan or "").lower()
 if plan not in PLANS:raise BillingError("unknown billing plan")
 now=time.time(); row=pg.query_one("INSERT INTO org_billing_plans (id,org_id,plan_id,limits,state,assigned_by,created_at,updated_at) VALUES (%s,%s,%s,%s,'active',%s,%s,%s) ON CONFLICT (org_id) DO UPDATE SET plan_id=EXCLUDED.plan_id,limits=EXCLUDED.limits,state='active',assigned_by=EXCLUDED.assigned_by,updated_at=EXCLUDED.updated_at RETURNING *",(str(uuid.uuid4()),org,plan,Jsonb(PLANS[plan]),actor,now,now)); return dict(row)
def evaluate(org,actor):
 _member(org,actor); plan=get(org,actor); totals=pg.query_one("SELECT COALESCE(SUM(cpu_millicores),0) cpu,COALESCE(SUM(memory_mb),0) memory,COALESCE(SUM(storage_gb),0) storage FROM service_usage_snapshots WHERE org_id=%s",(org,)); limits=plan["limits"]; exceeded=any(float(totals[k])>float(limits[name]) for k,name in (("cpu","max_cpu_millicores"),("memory","max_memory_mb"),("storage","max_storage_gb"))); state="grace" if exceeded and plan["state"]=="active" else "suspended" if exceeded and plan["state"]=="grace" and plan.get("grace_until") and plan["grace_until"]<time.time() else plan["state"]; pg.execute("UPDATE org_billing_plans SET state=%s,grace_until=%s,updated_at=%s WHERE org_id=%s",(state,time.time()+86400 if state=="grace" else plan.get("grace_until"),time.time(),org)); return {"plan":plan,"totals":dict(totals),"state":state,"exceeded":exceeded}
def resume(org,actor):
 _member(org,actor,True); row=pg.query_one("UPDATE org_billing_plans SET state='active',grace_until=NULL,updated_at=%s WHERE org_id=%s RETURNING *",(time.time(),org));
 if not row:raise BillingError("billing plan not found")
 return dict(row)
def export_usage(org,actor):
 _member(org,actor); return [dict(r) for r in pg.query_all("SELECT project_id,instance_id,runtime_id,cpu_millicores,memory_mb,storage_gb,running_seconds,provider_cost,observed_at FROM service_usage_snapshots WHERE org_id=%s ORDER BY observed_at",(org,))]
