# IDCloudHost blueprint — connectivity + state recording.
#
# NOTE: IDCloudHost has no official Terraform provider and no community REST
# provider is published on the OpenTofu/Terraform registries. This template
# therefore validates against the official `hashicorp/http` provider and
# records the requested servers into state with `terraform_data` so the
# worker can build the stack inventory. Real provisioning is executed by the
# worker against the IDCloudHost HTTP API (contract documented in README.md);
# a REST provider can be wired later via a filesystem mirror / dev_overrides.
provider "http" {}
