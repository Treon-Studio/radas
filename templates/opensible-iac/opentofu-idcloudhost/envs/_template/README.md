# IDCloudHost OpenTofu template (HTTP blueprint)

Managed by the **Cloud Provisioning** wizard. Copied into each stack directory
under `envs/<stack>/`.

## Provider
IDCloudHost is an Indonesian VPS provider (Jakarta & Singapore). It has no
official Terraform provider, and no community REST provider is published on
the OpenTofu/Terraform registries. This template therefore:

1. validates with the official `hashicorp/http` provider, and
2. records the requested servers into state via `terraform_data` (resource
   name `virtual_server` — do not rename; the worker builds the inventory
   from it).

Real provisioning is executed by the **worker** against the IDCloudHost HTTP
API. When a REST provider becomes available, wire it via a filesystem mirror
or `dev_overrides` and swap the `terraform_data` block for a `rest_object`.

> WARNING: the exact API endpoint and payload contract
> (`/v1/user-resource/virtual-server`) is unverified against a live account —
> validate before enabling real provisioning. The wizard schema, tfvars
> rendering and inventory flow work end-to-end regardless.

## Usage (from within the stack directory)
```bash
tofu init
tofu plan
tofu apply
```

## Layout
- `versions.tf` / `providers.tf` — `hashicorp/http` provider bootstrap.
- `main.tf` — connectivity data source + `terraform_data` server records.
- `credentials.auto.tfvars.example` — `api_token` sample.
