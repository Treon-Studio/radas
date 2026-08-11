# Remote backend config — edit before switching backend.tf to `backend "s3" {}`
# or any other remote backend supported by OpenTofu.
bucket = "REPLACE_ME_TFSTATE_BUCKET"
key    = "cloud-provisioning/biznet.tfstate"
region = ""
