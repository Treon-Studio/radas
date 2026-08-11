variable "env" {
  type = string
}

variable "project_name" {
  type = string
}

variable "region" {
  type    = string
  default = "JKT2"
}

variable "network_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "app_subnet_cidr" {
  type    = string
  default = "10.0.1.0/24"
}

variable "image" {
  type    = string
  default = "ubuntu-24.04"
}

variable "flavor" {
  type    = string
  default = "g2.small"
}

variable "app_vm_count" {
  type    = number
  default = 0
}

variable "os_auth_url" {
  type = string
}

variable "os_username" {
  type = string
}

variable "os_password" {
  type      = string
  sensitive = true
}

variable "os_project_name" {
  type = string
}

variable "os_domain_name" {
  type    = string
  default = "Default"
}

variable "floating_ip_pool" {
  type    = string
  default = "public"
}

variable "ssh_public_key" {
  type    = string
  default = ""
}

variable "enable_platform" {
  type    = bool
  default = false
}

variable "platform_roles" {
  type    = map(number)
  default = {}
}

variable "platform_overrides" {
  type    = map(map(string))
  default = {}
}

variable "enable_load_balancer" {
  type    = bool
  default = false
}

variable "extra_vms" {
  type    = map(object({
    vm_count = optional(number, 1)
    flavor   = optional(string)
    image    = optional(string)
  }))
  default = {}
}

variable "labels" {
  type    = map(string)
  default = {}
}
