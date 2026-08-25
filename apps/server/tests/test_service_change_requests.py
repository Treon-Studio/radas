from __future__ import annotations
import time, flask
from api import register_blueprints
from auth.service import generate_token
from storage import pg
ORG,PROJECT,USER,INSTANCE,REV="change-org","change-project","change-owner","change-instance","change-rev"
def seed(data_dir):
 now=time.time(); pg.execute("INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)",(ORG,ORG,USER,now)); pg.execute("INSERT INTO projects (id,org_id,owner_id,name,description,is_archived,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,0,%s,%s)",(PROJECT,ORG,USER,PROJECT,"",now,now)); pg.execute("INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)",(ORG,USER,"owner",now)); pg.execute("INSERT INTO service_instances (id,org_id,project_id,name,definition_slug,definition_version,environment,runtime_id,status,desired_revision_id,archived,created_by,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'draft',NULL,FALSE,%s,%s,%s)",(INSTANCE,ORG,PROJECT,"change-service","custom-container","1.0.0","dev","mock",USER,now,now)); pg.execute("INSERT INTO service_revisions (id,instance_id,revision_number,spec,redacted_spec,created_by,created_at) VALUES (%s,%s,1,%s,%s,%s,%s)",(REV,INSTANCE,'{}','{}',USER,now))
def client(data_dir):
 from auth import middleware
 middleware.set_data_dir(data_dir);seed(data_dir);app=flask.Flask("change-tests");app.config.update(TESTING=True,PROPAGATE_EXCEPTIONS=False);register_blueprints(app);return app.test_client()
def h(data_dir):return {"Authorization":f"Bearer {generate_token(USER,USER,[],data_dir,token_type='access')}"}
def test_change_request_diff_and_decision_history(data_dir):
 c=client(data_dir); headers=h(data_dir); created=c.post(f"/api/projects/{PROJECT}/services/{INSTANCE}/changes",headers=headers,json={"spec":{"token":"secret","name":"updated"}}); assert created.status_code==201; body=created.get_json()["data"]["change"]; assert "secret" not in str(body); cid=body["id"]; approved=c.post(f"/api/projects/{PROJECT}/services/{INSTANCE}/changes/{cid}/approve",headers=headers,json={"note":"looks good"}); assert approved.status_code==200; assert approved.get_json()["data"]["change"]["status"]=="approved"
