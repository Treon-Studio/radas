import pytest


def test_module_registry_publish(pg_db):
    from services.module_publisher import publish_module_tarball
    from storage import pg

    # 1. Seed org
    pg.execute(
        "INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s)",
        ("org-pub-01", "Acme Cloud", 1700000000.0),
    )

    manifest = {"inputs": {"vpc_cidr": {"type": "string"}}, "outputs": {"vpc_id": {"type": "string"}}}
    fake_tarball = b"fake-tarball-archive-bytes-for-vpc-module"

    res = publish_module_tarball(
        org_id="org-pub-01",
        slug="aws-vpc-hardened",
        version="1.2.0",
        manifest=manifest,
        archive_bytes=fake_tarball,
        publisher="admin-alice",
    )
    assert res["success"] is True
    assert res["org_id"] == "org-pub-01"
    assert res["slug"] == "aws-vpc-hardened"
    assert res["version"] == "1.2.0"
    assert len(res["sha256"]) == 64
    assert res["size"] == len(fake_tarball)


def test_multi_org_project_access_guard(pg_db):
    from services.multi_org_guard import validate_org_project_access
    from storage import pg

    # 1. Seed orgs, user, membership, and project
    pg.execute("INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s)", ("org-alpha", "Alpha Corp", 1700000000.0))
    pg.execute("INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s)", ("org-beta", "Beta LLC", 1700000000.0))
    pg.execute("INSERT INTO users (id, username, password_hash) VALUES (%s, %s, %s)", ("user-dan", "dan", "hash"))
    pg.execute("INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s)", ("org-alpha", "user-dan", "developer", 1700000000.0))
    pg.execute("INSERT INTO projects (id, org_id, name) VALUES (%s, %s, %s)", ("p-alpha-core", "org-alpha", "Alpha Core"))
    pg.execute("INSERT INTO projects (id, org_id, name) VALUES (%s, %s, %s)", ("p-beta-core", "org-beta", "Beta Core"))

    # 2. Access to own org's project is allowed
    assert validate_org_project_access("user-dan", "org-alpha", "p-alpha-core") is True

    # 3. Access to other org's project is blocked
    assert validate_org_project_access("user-dan", "org-beta", "p-beta-core") is False
    assert validate_org_project_access("user-dan", "org-alpha", "p-beta-core") is False


def test_stack_tfvars_storage(pg_db):
    from services.stack_tfvars_manager import save_stack_tfvars, get_stack_tfvars

    tfvars_content = 'environment = "production"\ninstance_count = 5\nenable_ssl = true\n'

    # 1. Initially empty
    assert get_stack_tfvars("p-stack-demo", "web-cluster") == ""

    # 2. Save tfvars
    save_res = save_stack_tfvars("p-stack-demo", "web-cluster", tfvars_content)
    assert save_res["success"] is True

    # 3. Retrieve
    saved = get_stack_tfvars("p-stack-demo", "web-cluster")
    assert "instance_count = 5" in saved
    assert "environment = \"production\"" in saved


def test_resource_import_command_generation():
    from services.resource_importer import generate_import_command

    res = generate_import_command(
        resource_address="aws_s3_bucket.data_lake",
        cloud_id="corp-lake-bucket-2026",
        provider="aws",
    )
    assert res["command"] == "tofu import aws_s3_bucket.data_lake corp-lake-bucket-2026"
    assert res["resource_type"] == "aws_s3_bucket"
    assert res["resource_name"] == "data_lake"

