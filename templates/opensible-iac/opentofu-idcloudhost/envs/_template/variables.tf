variable "env" {
  type = string
}

variable "project_name" {
  type = string
}

variable "region" {
  type = string
  default = "jakarta"
}

variable "server_plan" {
  type = string
  default = "vision-s-2"
}

variable "os_image" {
  type = string
  default = "ubuntu-24.04"
}

variable "ssh_public_key" {
  type = string
  default = ""
}

variable "app_vm_count" {
  type = number
  default = 1
}

variable "api_base_url" {
  type = string
  default = "https://api.idcloudhost.com/v1/user-resource"
}

variable "api_token" {
  type = string
  sensitive = true
}

variable "extra_vms" {
  type = map(map(string))
  default = {}
}

variable "labels" {
  type = map(string)
  default = {}
}
