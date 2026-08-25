# Bastion block — copied from Radas registry. Resources prefixed `bas_`.
variable "bas_server_type" {
  type    = string
  default = "cx21"
}

resource "hcloud_server" "bas_server" {
  name        = "${var.project_name}-bastion"
  server_type = var.bas_server_type
  image       = "ubuntu-24.04"
  location    = var.vpc_region
  ssh_keys    = []
}

resource "hcloud_floating_ip" "bas_fip" {
  type       = "ipv4"
  server_id  = hcloud_server.bas_server.id
  name       = "${var.project_name}-bastion-fip"
}
