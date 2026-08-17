from __future__ import annotations
from flask import Blueprint,request
from api.platform_contracts import error_response,success_response
from auth.middleware import require_auth
from services import billing_boundary
bp=Blueprint("billing_plan_api",__name__)
def actor():return (getattr(request,"current_user",{}) or {}).get("user_id")
def err(e):return error_response("BILLING_PLAN_ERROR",str(e),403 if "access" in str(e) else 422)
@bp.get("/api/orgs/<org_id>/billing-plan")
@require_auth
def get_plan(org_id):
 try:return success_response({"plan":billing_boundary.get(org_id,actor())})
 except billing_boundary.BillingError as e:return err(e)
@bp.put("/api/orgs/<org_id>/billing-plan")
@require_auth
def put_plan(org_id):
 try:return success_response({"plan":billing_boundary.assign(org_id,actor(),(request.get_json(silent=True) or {}).get("plan_id"))})
 except billing_boundary.BillingError as e:return err(e)
@bp.post("/api/orgs/<org_id>/billing-plan/evaluate")
@require_auth
def evaluate(org_id):
 try:return success_response(billing_boundary.evaluate(org_id,actor()))
 except billing_boundary.BillingError as e:return err(e)
@bp.post("/api/orgs/<org_id>/billing-plan/resume")
@require_auth
def resume(org_id):
 try:return success_response({"plan":billing_boundary.resume(org_id,actor())})
 except billing_boundary.BillingError as e:return err(e)
@bp.get("/api/orgs/<org_id>/billing-plan/usage-export")
@require_auth
def export_usage(org_id):
 try:return success_response({"rows":billing_boundary.export_usage(org_id,actor())})
 except billing_boundary.BillingError as e:return err(e)
