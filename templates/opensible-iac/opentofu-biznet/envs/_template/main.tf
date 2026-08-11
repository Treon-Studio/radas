locals {
  name_prefix = "${var.project_name}-${var.env}"
  base_labels = merge({
    managed_by = "opensible"
    env        = var.env
    project    = var.project_name
  }, var.labels)

  platform_servers = var.enable_platform ? merge([
    for role, count in var.platform_roles : {
      for i in range(count) :
      "${role}-${i + 1}" => {
        role   = role
        flavor = try(var.platform_overrides[role].flavor, null) != null ? var.platform_overrides[role].flavor : var.flavor
        image  = try(var.platform_overrides[role].image, null)  != null ? var.platform_overrides[role].image  : var.image
      }
    }
  ]...) : {}

  extra_servers = merge([
    for name, cfg in var.extra_vms : {
      for i in range(coalesce(cfg.vm_count, 1)) :
      "${name}-${i + 1}" => {
        role   = name
        flavor = coalesce(cfg.flavor, var.flavor)
        image  = coalesce(cfg.image, var.image)
      }
    }
  ]...)

  app_servers = { for i in range(var.app_vm_count) : "app-${i + 1}" => {
    role = "app"
    flavor = var.flavor
    image  = var.image
  } }

  all_servers = merge(local.app_servers, local.platform_servers, local.extra_servers)
}

data "openstack_networking_network_v2" "external" {
  name = var.floating_ip_pool
}

resource "openstack_networking_network_v2" "vpc" {
  name           = "${local.name_prefix}-vpc"
  admin_state_up = true
  tags           = ["managed_by=opensible"]
}

resource "openstack_networking_subnet_v2" "app" {
  name       = "${local.name_prefix}-app-subnet"
  network_id = openstack_networking_network_v2.vpc.id
  cidr       = var.app_subnet_cidr
  ip_version = 4
}

resource "openstack_networking_router_v2" "router" {
  name             = "${local.name_prefix}-router"
  external_network_id = data.openstack_networking_network_v2.external.id
}

resource "openstack_networking_router_interface_v2" "app" {
  router_id = openstack_networking_router_v2.router.id
  subnet_id = openstack_networking_subnet_v2.app.id
}

resource "openstack_networking_secgroup_v2" "ssh" {
  name        = "${local.name_prefix}-ssh"
  description = "SSH (22) + ICMP"
}

resource "openstack_networking_secgroup_rule_v2" "ssh_in" {
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 22
  port_range_max    = 22
  remote_ip_prefix  = "0.0.0.0/0"
  security_group_id = openstack_networking_secgroup_v2.ssh.id
}

resource "openstack_networking_secgroup_rule_v2" "icmp_in" {
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "icmp"
  remote_ip_prefix  = "0.0.0.0/0"
  security_group_id = openstack_networking_secgroup_v2.ssh.id
}

resource "openstack_compute_keypair_v2" "admin" {
  count      = var.ssh_public_key != "" ? 1 : 0
  name       = "${local.name_prefix}-key"
  public_key = var.ssh_public_key
}

resource "openstack_compute_instance_v2" "server" {
  for_each = local.all_servers

  name              = "${local.name_prefix}-${each.key}"
  image_name        = each.value.image
  flavor_name       = each.value.flavor
  key_pair          = var.ssh_public_key != "" ? openstack_compute_keypair_v2.admin[0].name : null
  availability_zone = null
  security_groups   = [openstack_networking_secgroup_v2.ssh.name]
  metadata          = merge(local.base_labels, { role = each.value.role })

  network {
    uuid = openstack_networking_network_v2.vpc.id
  }
}

resource "openstack_networking_floatingip_v2" "server" {
  for_each = local.all_servers
  pool     = var.floating_ip_pool
  port_id  = openstack_compute_instance_v2.server[each.key].network[0].port
}

resource "openstack_lb_loadbalancer_v2" "app" {
  count          = var.enable_load_balancer ? 1 : 0
  name           = "${local.name_prefix}-lb"
  vip_subnet_id  = openstack_networking_subnet_v2.app.id
}

resource "openstack_lb_listener_v2" "http" {
  count           = var.enable_load_balancer ? 1 : 0
  loadbalancer_id = openstack_lb_loadbalancer_v2.app[0].id
  protocol        = "HTTP"
  protocol_port   = 80
}

resource "openstack_networking_floatingip_v2" "lb" {
  count   = var.enable_load_balancer ? 1 : 0
  pool    = var.floating_ip_pool
  port_id = openstack_lb_loadbalancer_v2.app[0].vip_port_id
}
