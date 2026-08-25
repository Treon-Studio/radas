from __future__ import annotations
import time,flask
from api import register_blueprints
from auth.service import generate_token
from storage import pg
ORG,USER="billing-org","billing-owner"
def client(data_dir):
 from auth import middleware
 middleware.set_data_dir(data_dir);now=time.time();pg.execute("INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)",(ORG,ORG,USER,now));pg.execute("INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)",(ORG,USER,"owner",now));app=flask.Flask("billing");app.config.update(TESTING=True,PROPAGATE_EXCEPTIONS=False);register_blueprints(app);return app.test_client()
def h(d):return {"Authorization":f"Bearer {generate_token(USER,USER,[],d,token_type='access')}"}
def test_plan_lifecycle_and_export(data_dir):
 c=client(data_dir);headers=h(data_dir);assigned=c.put(f"/api/orgs/{ORG}/billing-plan",headers=headers,json={"plan_id":"free"});assert assigned.status_code==200; evaluated=c.post(f"/api/orgs/{ORG}/billing-plan/evaluate",headers=headers);assert evaluated.status_code==200; export=c.get(f"/api/orgs/{ORG}/billing-plan/usage-export",headers=headers);assert export.status_code==200
