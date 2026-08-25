"""Validation models for versioned RADAS service-definition manifests."""
from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator


_SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
_VERSION_RE = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$")
_IMAGE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9./_-]*(?::[^:@\s]+|@sha256:[0-9a-fA-F]{64})$")
_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,63}$")
_OUTPUT_RE = re.compile(r"^[a-z][a-z0-9_]{1,63}$")
_PATH_RE = re.compile(r"^/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$")

InputType = Literal["string", "integer", "number", "boolean", "domain", "url", "enum", "port", "secret"]
PersistenceMode = Literal["stateless", "optional", "required"]
RuntimeKind = Literal["container", "kubernetes"]
SupportedRuntime = Literal["docker", "podman", "kubernetes", "opentofu", "ansible"]
Category = Literal["automation", "messaging", "data", "storage", "observability", "web", "database", "other"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ServiceInput(StrictModel):
    name: str
    type: InputType
    required: bool = False
    default: Any = None
    min: int | float | None = None
    max: int | float | None = None
    choices: list[str] | None = None
    description: str | None = None

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        if not _NAME_RE.fullmatch(value):
            raise ValueError("must be an environment-safe name")
        return value

    @field_validator("description")
    @classmethod
    def valid_description(cls, value: str | None) -> str | None:
        if value is not None and (not value.strip() or len(value.strip()) > 500):
            raise ValueError("must be non-empty and at most 500 characters")
        return value.strip() if value is not None else value

    @model_validator(mode="after")
    def validate_range_and_default(self) -> "ServiceInput":
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("min must not be greater than max")
        if self.type == "enum" and not self.choices:
            raise ValueError("enum inputs require choices")
        if self.type != "enum" and self.choices:
            raise ValueError("choices are only valid for enum inputs")
        if self.choices and self.default is not None and self.default not in self.choices:
            raise ValueError("default must be one of choices")
        numeric_type = self.type in {"integer", "number", "port"}
        if not numeric_type and (self.min is not None or self.max is not None):
            raise ValueError("ranges are only valid for numeric inputs")
        if self.type in {"integer", "port"}:
            for field in ("min", "max", "default"):
                value = getattr(self, field)
                if value is not None and (isinstance(value, bool) or not isinstance(value, int)):
                    raise ValueError(f"{field} must be an integer")
            if self.type == "port":
                if self.min is not None and not 1 <= self.min <= 65535:
                    raise ValueError("port min must be between 1 and 65535")
                if self.max is not None and not 1 <= self.max <= 65535:
                    raise ValueError("port max must be between 1 and 65535")
                if self.default is not None and not 1 <= self.default <= 65535:
                    raise ValueError("port default must be between 1 and 65535")
        if self.type == "number" and self.default is not None and (
            isinstance(self.default, bool) or not isinstance(self.default, (int, float))
        ):
            raise ValueError("default must be numeric")
        if self.type == "boolean" and self.default is not None and not isinstance(self.default, bool):
            raise ValueError("default must be boolean")
        if self.type in {"string", "domain", "url", "secret"} and self.default is not None and not isinstance(self.default, str):
            raise ValueError("default must be a string")
        if self.type == "secret" and self.default is not None:
            raise ValueError("secret inputs cannot have defaults")
        if self.min is not None and self.default is not None and isinstance(self.default, (int, float)):
            if self.default < self.min or (self.max is not None and self.default > self.max):
                raise ValueError("default is outside the declared range")
        return self


class SecretDeclaration(StrictModel):
    name: str
    required: bool = True
    description: str | None = None

    @model_validator(mode="after")
    def reference_only(self) -> "SecretDeclaration":
        # Catalog manifests declare references, never credential material.
        # Secret values are supplied by the secret manager at execution time.
        return self

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        if not _NAME_RE.fullmatch(value):
            raise ValueError("must be an environment-safe name")
        return value

    @field_validator("description")
    @classmethod
    def valid_description(cls, value: str | None) -> str | None:
        if value is not None and (not value.strip() or len(value.strip()) > 500):
            raise ValueError("must be non-empty and at most 500 characters")
        return value.strip() if value is not None else value


class StorageDeclaration(StrictModel):
    name: str
    size_gb: int | float = Field(gt=0)
    required: bool = True
    mount_path: str = "/data"
    description: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("metadata")
    @classmethod
    def safe_metadata(cls, value: dict[str, Any]) -> dict[str, Any]:
        # Metadata describes the volume contract; credential material belongs
        # in secret references and is never part of a catalog manifest.
        for key in value:
            if re.search(r"(?:secret|password|token|credential|private.?key|api.?key)", str(key), re.IGNORECASE):
                raise ValueError("storage metadata must not declare credential-like keys")
        return value

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        if not _NAME_RE.fullmatch(value):
            raise ValueError("must be an environment-safe name")
        return value

    @field_validator("mount_path")
    @classmethod
    def valid_mount_path(cls, value: str) -> str:
        if not value.startswith("/") or value == "/" or ".." in value.split("/"):
            raise ValueError("must be an absolute, non-root mount path")
        return value


class PortDeclaration(StrictModel):
    name: str
    port: int = Field(gt=0, le=65535)
    protocol: Literal["tcp", "udp"] = "tcp"
    public: bool = False
    description: str | None = None

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        if not _NAME_RE.fullmatch(value):
            raise ValueError("must be an environment-safe name")
        return value


class EndpointDeclaration(StrictModel):
    name: str
    port: int | str
    path: str = "/"
    public: bool = False
    description: str | None = None

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        if not _NAME_RE.fullmatch(value):
            raise ValueError("must be an environment-safe name")
        return value

    @field_validator("port")
    @classmethod
    def valid_port(cls, value: int | str) -> int | str:
        if isinstance(value, bool):
            raise ValueError("must be a port number or declared port name")
        if isinstance(value, int) and not 1 <= value <= 65535:
            raise ValueError("port must be between 1 and 65535")
        if isinstance(value, str) and not _NAME_RE.fullmatch(value):
            raise ValueError("port reference must be an environment-safe name")
        return value

    @field_validator("path")
    @classmethod
    def valid_path(cls, value: str) -> str:
        if not _PATH_RE.fullmatch(value):
            raise ValueError("must be an absolute URL path")
        return value


class Healthcheck(StrictModel):
    path: str
    port: int = Field(gt=0, le=65535)
    interval_seconds: int = Field(gt=0, le=86400)
    method: Literal["GET", "HEAD"] = "GET"

    @field_validator("path")
    @classmethod
    def valid_path(cls, value: str) -> str:
        if not _PATH_RE.fullmatch(value):
            raise ValueError("must be an absolute URL path")
        return value


class LifecycleCapabilities(StrictModel):
    start: bool = True
    stop: bool = True
    restart: bool = True
    update: bool = True
    rollback: bool = True
    destroy: bool = True


class DependencyDeclaration(StrictModel):
    name: str
    kind: Literal["database", "cache", "storage", "network", "service", "secret", "other"] = "service"
    required: bool = True
    description: str | None = None

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        if not _NAME_RE.fullmatch(value):
            raise ValueError("must be an environment-safe name")
        return value


class MinimumResources(StrictModel):
    cpu_millicores: int = Field(default=100, gt=0)
    memory_mb: int = Field(default=256, gt=0)
    storage_gb: int | float = Field(default=0, ge=0)


class ServiceDefinitionManifest(StrictModel):
    schema_version: Literal[1] = 1
    slug: str
    name: str
    version: str
    category: Category
    summary: str
    runtime: RuntimeKind
    image: str
    production_ready: bool
    persistence: PersistenceMode
    inputs: list[ServiceInput] = Field(default_factory=list)
    secrets: list[SecretDeclaration] = Field(default_factory=list)
    storage: list[StorageDeclaration] = Field(default_factory=list)
    ports: list[PortDeclaration] = Field(default_factory=list)
    endpoints: list[EndpointDeclaration] = Field(default_factory=list)
    healthcheck: Healthcheck
    lifecycle: LifecycleCapabilities = Field(default_factory=LifecycleCapabilities)
    dependencies: list[DependencyDeclaration] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)
    supported_runtimes: list[SupportedRuntime]
    minimum_resources: MinimumResources = Field(default_factory=MinimumResources)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("slug")
    @classmethod
    def valid_slug(cls, value: str) -> str:
        if not _SLUG_RE.fullmatch(value):
            raise ValueError("must be lowercase kebab-case")
        return value

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        if not value.strip() or len(value.strip()) > 100:
            raise ValueError("must be non-empty and at most 100 characters")
        return value.strip()

    @field_validator("summary")
    @classmethod
    def valid_summary(cls, value: str) -> str:
        if len(value.strip()) < 10 or len(value.strip()) > 500:
            raise ValueError("must be between 10 and 500 characters")
        return value.strip()

    @field_validator("version")
    @classmethod
    def valid_version(cls, value: str) -> str:
        if not _VERSION_RE.fullmatch(value):
            raise ValueError("must be semantic versioning (for example 1.0.0)")
        return value

    @field_validator("image")
    @classmethod
    def pinned_image(cls, value: str) -> str:
        if not _IMAGE_RE.fullmatch(value) or value.lower().endswith(":latest"):
            raise ValueError("must be a pinned image tag or sha256 digest, not latest")
        return value

    @field_validator("outputs")
    @classmethod
    def valid_outputs(cls, values: list[str]) -> list[str]:
        if len(values) != len(set(values)):
            raise ValueError("must not contain duplicate output names")
        for value in values:
            if not _OUTPUT_RE.fullmatch(value):
                raise ValueError("must contain lowercase output names")
        return values

    @field_validator("supported_runtimes")
    @classmethod
    def valid_runtimes(cls, values: list[SupportedRuntime]) -> list[SupportedRuntime]:
        if not values:
            raise ValueError("must declare at least one supported runtime")
        if len(values) != len(set(values)):
            raise ValueError("must not contain duplicate runtimes")
        return values

    @model_validator(mode="after")
    def validate_manifest_rules(self) -> "ServiceDefinitionManifest":
        secret_names = [secret.name for secret in self.secrets]
        if len(secret_names) != len(set(secret_names)):
            raise ValueError("secret names must be unique")
        input_names = [item.name for item in self.inputs]
        if len(input_names) != len(set(input_names)):
            raise ValueError("input names must be unique")
        storage_names = [item.name for item in self.storage]
        if len(storage_names) != len(set(storage_names)):
            raise ValueError("storage names must be unique")
        dependency_names = [item.name for item in self.dependencies]
        if len(dependency_names) != len(set(dependency_names)):
            raise ValueError("dependency names must be unique")
        port_names = [item.name for item in self.ports]
        if len(port_names) != len(set(port_names)) or len({item.port for item in self.ports}) != len(self.ports):
            raise ValueError("port names and numbers must be unique")
        endpoint_names = [item.name for item in self.endpoints]
        if len(endpoint_names) != len(set(endpoint_names)):
            raise ValueError("endpoint names must be unique")
        if self.persistence == "required" and not self.storage:
            raise ValueError("persistent definitions must declare storage")
        # Cross-field port references are required even when the declaration
        # is omitted.  Otherwise a healthcheck or endpoint could point at an
        # undeclared/exposed port and bypass the manifest contract.
        declared_ports = {item.port for item in self.ports}
        if self.healthcheck.port not in declared_ports:
            raise ValueError("healthcheck port must be declared in ports")
        port_names_set = set(port_names)
        for endpoint in self.endpoints:
            if isinstance(endpoint.port, int) and endpoint.port not in declared_ports:
                raise ValueError("endpoint port must be declared in ports")
            if isinstance(endpoint.port, str) and endpoint.port not in port_names_set:
                raise ValueError("endpoint port reference must name a declared port")
        secret_set = set(secret_names)
        for item in self.inputs:
            if item.type == "secret" and item.name not in secret_set:
                raise ValueError("secret inputs must have a matching secret declaration")
        if self.slug == "waha-plus" and "license_policy" not in self.metadata:
            raise ValueError("WAHA Plus must declare license_policy metadata")
        if "license_policy" in self.metadata and not isinstance(self.metadata["license_policy"], (str, dict)):
            raise ValueError("license_policy metadata must be a string or object")
        return self


def validation_errors(manifest: Any) -> list[dict[str, Any]]:
    """Return stable, client-safe validation errors for a manifest."""
    try:
        ServiceDefinitionManifest.model_validate(manifest)
    except ValidationError as exc:
        return [
            {
                "path": ".".join(str(part) for part in error["loc"]) or "$",
                "code": error["type"],
                "message": error["msg"],
            }
            for error in exc.errors()
        ]
    return []


def normalize_manifest(manifest: Any) -> dict[str, Any]:
    """Validate and return only the public, persisted manifest fields."""
    model = ServiceDefinitionManifest.model_validate(manifest)
    return model.model_dump(mode="json", exclude_none=True)
