locals {
  name_prefix = "${var.project_name}-${var.env}"
  base_labels = merge({
    managed_by = "opensible"
    env        = var.env
    project    = var.project_name
  }, var.labels)

  servers = { for i in range(var.app_vm_count) : "app-${i + 1}" => {
    role     = "app"
    plan     = var.server_plan
    os       = var.os_image
    hostname = "${local.name_prefix}-app-${i + 1}"
  } }
}

# Connectivity smoke check against the IDCloudHost API (read-only). The exact
# endpoint + payload contract for real provisioning is documented in README.md
# and must be verified against a live account.
data "http" "api_root" {
  url = var.api_base_url

  request_headers = {
    "x-api-key"     = var.api_token
    "Content-Type"  = "application/json"
  }
}

# Record the requested servers into state so the worker can build the stack
# inventory (resource name `virtual_server` is stable — do not rename).
resource "terraform_data" "virtual_server" {
  for_each = local.servers

  input = {
    hostname = each.value.hostname
    region   = var.region
    plan     = each.value.plan
    os       = each.value.os
    ssh_key  = var.ssh_public_key
    role     = each.value.role
  }
}
