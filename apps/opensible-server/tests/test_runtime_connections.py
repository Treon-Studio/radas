from __future__ import annotations
import time, flask
from api import register_blueprints
from auth.service import generate_token
from storage import pg

ORG, USER, OTHER = "runtime-org", "runtime-owner", "runtime-other"

def _seed(data_dir):
    now=time.time(); pg.execute("INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)",(ORG,ORG,USER,now)); pg.execute("INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)",(ORG,USER,"owner",now)); pg.execute("INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)",(ORG,OTHER,"member",now))

def _client(data_dir):
    from auth import middleware
    middleware.set_data_dir(data_dir); _seed(data_dir); app=flask.Flask("runtime-connection-tests"); app.config.update(TESTING=True,PROPAGATE_EXCEPTIONS=False); register_blueprints(app); return app.test_client()

def _h(user,data_dir): return {"Authorization":f"Bearer {generate_token(user,user,[],data_dir,token_type='access')}"}

def test_runtime_connection_metadata_health_and_auth(data_dir):
    c=_client(data_dir); owner=_h(USER,data_dir); member=_h(OTHER,data_dir)
    denied=c.post(f"/api/orgs/{ORG}/runtime-connections",headers=member,json={"name":"mock","runtime_id":"mock","secret_id":"global-secret"}); assert denied.status_code==403
    created=c.post(f"/api/orgs/{ORG}/runtime-connections",headers=owner,json={"name":"mock","runtime_id":"mock","secret_id":"global-secret"}); assert created.status_code==201
    body=created.get_json()["data"]["connection"]; assert "secret_id" not in body; cid=body["id"]
    tested=c.post(f"/api/orgs/{ORG}/runtime-connections/{cid}/test",headers=member); assert tested.status_code==200; assert tested.get_json()["data"]["connection"]["healthy"] is True
    rotated=c.post(f"/api/orgs/{ORG}/runtime-connections/{cid}/rotate",headers=owner,json={"secret_id":"rotated-secret"}); assert rotated.status_code==200; assert "rotated-secret" not in str(rotated.get_json())
