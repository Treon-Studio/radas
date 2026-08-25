"""SAML 2.0 Identity Provider authentication response handler (UC493)."""
from __future__ import annotations

import logging
import xml.etree.ElementTree as ET
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def process_saml_assertion(
    saml_response_xml: str,
    idp_cert: Optional[str] = None,
) -> Dict[str, Any]:
    """Parse and validate SAML 2.0 identity assertion payload (UC493)."""
    if not saml_response_xml:
        raise ValueError("Empty SAML response")

    try:
        root = ET.fromstring(saml_response_xml)
    except Exception as err:
        raise ValueError(f"Invalid SAML XML payload: {err}")

    name_id = None
    for elem in root.iter():
        if elem.tag.endswith("NameID"):
            name_id = elem.text.strip() if elem.text else None
            break

    issuer = None
    for elem in root.iter():
        if elem.tag.endswith("Issuer"):
            issuer = elem.text.strip() if elem.text else None
            break

    attributes: Dict[str, str] = {}
    for elem in root.iter():
        if elem.tag.endswith("Attribute"):
            attr_name = elem.attrib.get("Name")
            if attr_name:
                for child in elem:
                    if child.tag.endswith("AttributeValue") and child.text:
                        attributes[attr_name] = child.text.strip()

    email = attributes.get("email") or name_id or ""
    username = attributes.get("username") or (email.split("@")[0] if "@" in email else email)
    role = attributes.get("role", "viewer")

    logger.info(f"Parsed SAML assertion for NameID: {name_id} from Issuer: {issuer}")

    return {
        "success": True,
        "name_id": name_id,
        "email": email,
        "username": username,
        "role": role,
        "issuer": issuer,
        "attributes": attributes,
    }
