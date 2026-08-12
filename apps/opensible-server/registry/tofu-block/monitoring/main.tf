# Monitoring block — copied from Radas registry. Resources prefixed `mon_`.
variable "mon_server_type" {
  type    = string
  default = "cx22"
}

variable "mon_image" {
  type    = string
  default = "ubuntu-24.04"
}

variable "mon_ssh_key" {
  type    = string
  default = ""
}

resource "hcloud_server" "mon_server" {
  name        = "${var.project_name}-monitoring"
  server_type = var.mon_server_type
  image       = var.mon_image
  location    = var.vpc_region
  ssh_keys    = var.mon_ssh_key != "" ? [var.mon_ssh_key] : []
}

resource "hcloud_volume" "mon_data" {
  name      = "${var.project_name}-mon-data"
  size      = 20
  server_id = hcloud_server.mon_server.id
  format    = "ext4"
}
