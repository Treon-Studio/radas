# Biznet Gio OpenTofu template

Managed by the **Cloud Provisioning** wizard. Copied into each stack directory
under `envs/<stack>/`.

## Provider
Biznet Gio Cloud is an OpenStack-compatible public cloud. This template uses
`terraform-provider-openstack` with Keystone v3 credentials
(`credentials.auto.tfvars.example` → `credentials.auto.tfvars`, chmod 600).

## Resources
- VPC network + app subnet + router (NAT to floating IP pool)
- SSH security group (22/tcp, icmp) and admin keypair
- App / Platform / Extra server pools (`openstack_compute_instance_v2`)
- One floating IP per server; optional Octavia load balancer + listener

## Usage (from within the stack directory)
```bash
tofu init
tofu plan
tofu apply
```

Region codes: JKT1/JKT2 (Jakarta), SBY (Surabaya), SIN (Singapore).
