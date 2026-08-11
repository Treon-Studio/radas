# Biznet Gio (OpenStack) provider. Credentials come from credentials.auto.tfvars
# (chmod 600) rendered by the OpenSible backend from the encrypted secret store.
provider "openstack" {
  auth_url    = var.os_auth_url
  user_name   = var.os_username
  password    = var.os_password
  tenant_name = var.os_project_name
  domain_name = var.os_domain_name
  region      = var.region
}
