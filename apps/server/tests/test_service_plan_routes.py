from __future__ import annotations
import time, flask
from api import register_blueprints
from auth.service import generate_token
from storage import pg

ORG, PROJECT, USER, INSTANCE, REV = "plan-org", "plan-project", "plan-user", "plan-instance", "plan-revision"

def seed(data_dir):
    now=time.time(); pg.execute("INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)",(ORG,ORG,USER,now)); pg.execute("INSERT INTO projects (id,org_id,owner_id,name,description,is_archived,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,0,%s,%s)",(PROJECT,ORG,USER,PROJECT,"",now,now)); pg.execute("INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)",(ORG,USER,"owner",now)); pg.execute("INSERT INTO service_instances (id,org_id,project_id,name,definition_slug,definition_version,environment,runtime_id,status,desired_revision_id,archived,created_by,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'draft',NULL,FALSE,%s,%s,%s)",(INSTANCE,ORG,PROJECT,"plan-service","custom-container","1.0.0","dev","mock",USER,now,now)); pg.execute("INSERT INTO service_revisions (id,instance_id,revision_number,spec,redacted_spec,created_by,created_at) VALUES (%s,%s,1,%s,%s,%s,%s)",(REV,INSTANCE,'{}','{}',USER,now))

def client(data_dir):
    from auth import middleware
    middleware.set_data_dir(data_dir); seed(data_dir); app=flask.Flask("plan-tests"); app.config.update(TESTING=True,PROPAGATE_EXCEPTIONS=False); register_blueprints(app); return app.test_client()
def h(data_dir): return {"Authorization":f"Bearer {generate_token(USER,USER,[],data_dir,token_type='access')}"}

def test_plan_before_apply(data_dir):
    c=client(data_dir); headers=h(data_dir)
    plan=c.post(f"/api/projects/{PROJECT}/services/{INSTANCE}/plan",headers=headers); assert plan.status_code==200
    fp=plan.get_json()["data"]["plan"]["data"]["fingerprint"]
    applied=c.post(f"/api/projects/{PROJECT}/services/{INSTANCE}/apply-plan",headers={**headers,"Idempotency-Key":"apply-plan-1"},json={"plan_fingerprint":fp}); assert applied.status_code in {202,422}
    stale=c.post(f"/api/projects/{PROJECT}/services/{INSTANCE}/apply-plan",headers={**headers,"Idempotency-Key":"apply-plan-2"},json={"plan_fingerprint":"stale"}); assert stale.status_code in {202,422}
