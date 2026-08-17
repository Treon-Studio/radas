from services import feature_flags

def test_seed_defaults_is_idempotent(data_dir):
    assert feature_flags.seed_default_flags() == 4
    assert feature_flags.seed_default_flags() == 0
    assert {f["key"] for f in feature_flags.list_flags()} == set(feature_flags.DEFAULT_FLAGS)

def test_bulk_export_import_roundtrip(data_dir):
    feature_flags.create_flag({"key":"batch","rollout_percent":100,"tags":["test"]})
    exported=feature_flags.export_flags()
    assert feature_flags.import_flags(exported)==1
    assert feature_flags.get_flag("batch")["tags"]==["test"]
