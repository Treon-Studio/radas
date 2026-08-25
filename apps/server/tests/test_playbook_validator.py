"""Tests for Playbook Parser and Validator."""
from __future__ import annotations
import pytest
from playbooks.parser import PlaybookParser, PlaybookParseError
from playbooks.validator import PlaybookValidator

def test_parser_valid_yaml():
    parser = PlaybookParser()
    yaml_content = """
- name: Test Play
  hosts: all
  roles:
    - common
    - role: webserver
      tags: [web, http]
      vars:
        port: 80
    - name: database
    """
    playbook = parser.parse(yaml_content, "My Playbook")
    assert playbook["name"] == "My Playbook"
    assert len(playbook["plays"]) == 1
    
    play = playbook["plays"][0]
    assert play["name"] == "Test Play"
    assert play["hosts"] == "all"
    assert len(play["roles"]) == 3
    
    role1 = play["roles"][0]
    assert role1["role_name"] == "common"
    assert role1["tag"] == "common"
    
    role2 = play["roles"][1]
    assert role2["role_name"] == "webserver"
    assert role2["tag"] == "web,http"
    assert role2["vars_override"] == {"port": 80}
    
    role3 = play["roles"][2]
    assert role3["role_name"] == "database"
    assert role3["tag"] == "database"

def test_parser_invalid_yaml():
    parser = PlaybookParser()
    with pytest.raises(PlaybookParseError):
        parser.parse("invalid: yaml: :")

def test_parser_empty_yaml():
    parser = PlaybookParser()
    with pytest.raises(PlaybookParseError, match="YAML file is empty"):
        parser.parse("")

def test_validate_structure():
    parser = PlaybookParser()
    valid, err = parser.validate_yaml_structure("invalid: yaml: :")
    assert not valid
    assert "Invalid YAML syntax" in err

    valid, err = parser.validate_yaml_structure("")
    assert not valid
    assert "YAML file is empty" in err

    valid, err = parser.validate_yaml_structure("not-a-list-or-dict")
    assert not valid
    assert "YAML must contain a list of plays or a single play" in err

    valid, err = parser.validate_yaml_structure("- name: Test Play")
    assert not valid
    assert "missing required field 'hosts'" in err

    valid, err = parser.validate_yaml_structure("- name: Test Play\n  hosts: all")
    assert valid
    assert err is None

def test_validator():
    inventory_groups = {
        "webservers": {"hosts": ["web1", "web2"]},
        "empty_group": {"hosts": []}
    }
    available_roles = ["common", "webserver", "database"]
    role_dependencies = {
        "webserver": {
            "requires_group": "webservers",
            "requires_group_level": "error"
        },
        "database": {
            "requires_roles": ["common"]
        }
    }
    
    validator = PlaybookValidator(
        inventory_groups=inventory_groups,
        available_roles=available_roles,
        role_dependencies=role_dependencies
    )
    
    # Valid playbook
    valid_playbook = {
        "plays": [
            {
                "id": "play-1",
                "name": "Configure webservers",
                "hosts": "webservers",
                "roles": [
                    {"role_name": "common"},
                    {"role_name": "webserver"}
                ]
            }
        ]
    }
    res = validator.validate(valid_playbook)
    assert res["summary"]["total_errors"] == 0
    assert res["summary"]["total_warnings"] == 0
    assert res["summary"]["playbook_can_run"] is True

    # Playbook with various issues
    invalid_playbook = {
        "plays": [
            {
                "id": "play-1",
                "name": "Configure webservers",
                "hosts": "dbservers", # Warning: group not exists
                "roles": [
                    {"role_name": "unknown_role"}, # Error: role not exists
                    {"role_name": "webserver"} # Error: requires group webservers but hosts is dbservers
                ]
            },
            {
                "id": "play-1", # Error: duplicate play ID
                "name": "", # Error: play name is required
                "hosts": "empty_group", # Warning: group is empty
                "roles": [
                    {"role_name": "database"} # Warning: database requires common to be executed before it
                ]
            }
        ]
    }
    res = validator.validate(invalid_playbook)
    assert res["summary"]["total_errors"] > 0
    assert res["summary"]["total_warnings"] > 0
    assert any(w["code"] == "ROLE_ORDERING_VIOLATION" for w in res["plays"][1]["warnings"])
    assert res["summary"]["playbook_can_run"] is False
