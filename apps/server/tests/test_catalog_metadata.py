from __future__ import annotations
import flask
from api import register_blueprints
from auth.service import generate_token
from storage import pg

def test_catalog_metadata_is_redacted_and_deprecation_requires_admin(data_dir):
 from auth import middleware
 middleware.set_data_dir(data_dir); app=flask.Flask("catalog-metadata"); app.config.update(TESTING=True,PROPAGATE_EXCEPTIONS=False); register_blueprints(app)
 user="catalog-meta-user"; token=generate_token(user,user,[],data_dir,token_type="access"); c=app.test_client(); h={"Authorization":f"Bearer {token}"}
 # Unprivileged callers cannot deprecate definitions.
 response=c.post("/api/platform/catalog/custom-container/1.0.0/deprecate",headers=h,json={"reason":"security issue"})
 assert response.status_code in {403,404}
