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

InputType = Literal["string", "integer", "number", "boolean", "domain", "url", "enum", "port", "secret"]
PersistenceMode = Literal["stateless", "optional", "required"]
RuntimeKind = Literal["container", "kubernetes"]
SupportedRuntime = Literal["docker", "podman", "kubernetes", "opentofu", "ansible"]


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
                if self.min is not None and (self.min < 1 or self.min > 65535):
                    raise ValueError("port min must be between 1 and 65535")
                if self.max is not None and (self.max < 1 or self.max > 65535):
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
        if self.min is not None and self.default is not None and isinstance(self.default, (int, float)):
            if self.default < self.min or (self.max is not None and self.default > self.max):
                raise ValueError("default is outside the declared range")
        return self


class SecretDeclaration(StrictModel):
    name: str
    required: bool = True
    description: str | None = None

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        if not _NAME_RE.fullmatch(value):
            raise ValueError("must be an environment-safe name")
        return value


class StorageDeclaration(StrictModel):
    name: str
    size_gb: int | float = Field(gt=0)
    required: bool = True
    mount_path: str = "/data"
    description: str | None = None

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


class Healthcheck(StrictModel):
    path: str
    port: int = Field(gt=0, le=65535)
    interval_seconds: int = Field(gt=0, le=86400)
    method: Literal["GET", "HEAD"] = "GET"

    @field_validator("path")
    @classmethod
    def valid_path(cls, value: str) -> str:
        if not value.startswith("/") or ".." in value.split("/"):
            raise ValueError("must be an absolute URL path")
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
    category: str
    summary: str
    runtime: RuntimeKind
    image: str
    production_ready: bool
    persistence: PersistenceMode
    inputs: list[ServiceInput] = Field(default_factory=list)
    secrets: list[SecretDeclaration] = Field(default_factory=list)
    storage: list[StorageDeclaration] = Field(default_factory=list)
    healthcheck: Healthcheck
    outputs: list[str] = Field(default_factory=list)
    supported_runtimes: list[SupportedRuntime]
    minimum_resources: MinimumResources = Field(default_factory=MinimumResources)

    @field_validator("slug")
    @classmethod
    def valid_slug(cls, value: str) -> str:
        if not _SLUG_RE.fullmatch(value):
            raise ValueError("must be lowercase kebab-case")
        return value

    @field_validator("name", "category", "summary")
    @classmethod
    def non_empty_text(cls, value: str) -> str:
        if not value.strip() or len(value.strip()) > 500:
            raise ValueError("must be non-empty and at most 500 characters")
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
        if self.persistence == "required" and not self.storage:
            raise ValueError("persistent definitions must declare storage")
        secret_names = [secret.name for secret in self.secrets]
        if len(secret_names) != len(set(secret_names)):
            raise ValueError("secret names must be unique")
        input_names = [item.name for item in self.inputs]
        if len(input_names) != len(set(input_names)):
            raise ValueError("input names must be unique")
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
