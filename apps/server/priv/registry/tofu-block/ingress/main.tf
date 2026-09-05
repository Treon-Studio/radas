# Ingress block — copied from Radas registry. Resources prefixed `ing_`.
variable "ing_load_balancer_type" {
  type    = string
  default = "lb11"
}

variable "ing_tls_cert_pem" {
  type    = string
  default = ""
}

resource "hcloud_load_balancer" "ing_lb" {
  name               = "${var.project_name}-lb"
  load_balancer_type = var.ing_load_balancer_type
  location           = var.vpc_region
}

resource "hcloud_load_balancer_service" "ing_http" {
  load_balancer_id = hcloud_load_balancer.ing_lb.id
  protocol         = "http"
  listen_port      = 80
  destination_port = 8080
}

resource "hcloud_load_balancer_service" "ing_https" {
  load_balancer_id = hcloud_load_balancer.ing_lb.id
  protocol         = "tcp"
  listen_port      = 443
  destination_port = 8443
}
