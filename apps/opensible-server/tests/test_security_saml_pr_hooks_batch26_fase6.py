import pytest


def test_csp_instance_cost_estimator(pg_db):
    from services.csp_cost_estimator import estimate_csp_instance_cost
    from services.pricing_table_updater import update_provider_pricing_table

    # 1. Update provider rate
    update_provider_pricing_table("aws", {"t3.medium": 0.0416})

    # 2. Estimate 730 hours monthly
    est = estimate_csp_instance_cost("aws", "t3.medium", hours_per_month=730.0)
    assert est["provider"] == "aws"
    assert est["instance_type"] == "t3.medium"
    assert est["hourly_rate"] == 0.0416
    assert est["monthly_cost"] == 30.37


def test_at_rest_config_cipher():
    from utils.config_cipher import encrypt_config_value, decrypt_config_value

    secret_raw = "super-secret-database-password-12345"
    key = "master-cluster-encryption-key"

    # 1. Encrypt
    cipher = encrypt_config_value(secret_raw, secret_key=key)
    assert cipher.startswith("enc:v1:")
    assert secret_raw not in cipher

    # 2. Decrypt
    decrypted = decrypt_config_value(cipher, secret_key=key)
    assert decrypted == secret_raw
