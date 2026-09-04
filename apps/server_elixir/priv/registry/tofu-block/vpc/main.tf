# VPC block — copied from Radas registry. Resources prefixed `vpc_` to avoid
# collisions with other registry blocks installed on the same stack.
variable "vpc_region" {
  type    = string
  default = "fsn1"
}

variable "vpc_network_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

resource "hcloud_network" "vpc_net" {
  name     = "${var.project_name}-vpc"
  ip_range = var.vpc_network_cidr
}

resource "hcloud_network_subnet" "vpc_subnet" {
  network_id   = hcloud_network.vpc_net.id
  type         = "cloud"
  network_zone = var.vpc_region
  ip_range     = "10.0.0.0/24"
}

resource "hcloud_network_route" "vpc_route" {
  network_id  = hcloud_network.vpc_net.id
  destination = "10.0.0.0/24"
  gateway     = "10.0.0.1"
}

resource "hcloud_firewall" "vpc_fw" {
  name = "${var.project_name}-vpc-fw"

  rule {
    direction       = "in"
    protocol        = "tcp"
    port            = "22"
    source_ips      = ["0.0.0.0/0"]
    description     = "SSH"
  }
}
