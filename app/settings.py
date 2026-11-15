"""All server configuration, read once from the environment (and .env) and validated.

Import the shared instance with ``from app.settings import settings``. Tests can
call ``reload_settings()`` after changing environment variables.
"""
import os
import tempfile
from typing import List, Optional

from dotenv import load_dotenv
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from typing_extensions import Annotated

load_dotenv()

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CSV = Annotated[List[str], NoDecode]  # comma-separated list in the environment


def _split_csv(value) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [v.strip() for v in value.split(",") if v.strip()]
    return list(value)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", case_sensitive=False)

    # ── LLM ─────────────────────────────────────────────────────────────
    llm_provider: str = "gemini"  # gemini | openai_compat | anthropic
    llm_base_url: str = ""  # required for openai_compat
    llm_api_key: str = ""  # falls back to GEMINI_API_KEY for the gemini provider
    llm_models: CSV = Field(default_factory=list)
    llm_condense_model: str = ""  # optional cheaper model for long-document condensing
    llm_max_output_tokens: int = 8192
    llm_temperature: float = 0.7
    llm_timeout_s: int = 90
    llm_max_direct_chars: int = 60_000
    llm_chunk_chars: int = 12_000
    llm_chat_context_chars: int = 30_000
    gemini_api_key: str = ""

    # ── Storage ─────────────────────────────────────────────────────────
    mongo_uri: str = "mongodb://127.0.0.1:27017"
    mongo_db: str = "notebooklm_studio"
    mongo_timeout_ms: int = 3000
    blob_read_write_token: str = ""  # Vercel Blob; images are stored there when set

    # ── Security & limits ──────────────────────────────────────────────
    app_access_keys: CSV = Field(default_factory=list)
    allowed_origins: CSV = Field(default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"])
    trust_proxy: bool = False
    rate_limit_store: str = "auto"  # auto | memory | mongo
    rate_limit_general_per_min: int = 240
    rate_limit_ai_per_min: int = 20
    rate_limit_ai_per_hour: int = 200
    rate_limit_tts_per_min: int = 10
    rate_limit_auth_fail_per_5min: int = 10
    max_request_bytes: int = 4 * 1024 * 1024  # Vercel rejects bodies over ~4.5 MB anyway
    max_document_chars: int = 600_000

    # ── Generation cache & jobs ───────────────────────────────────────
    cache_ttl_days: int = 30
    job_heartbeat_s: float = 10.0

    # ── Narration ───────────────────────────────────────────────────────
    tts_backend: str = ""  # sapi | gemini | espeak; empty = auto
    gemini_tts_model: str = "gemini-2.5-flash-preview-tts"
    gemini_tts_voice_a: str = "Puck"
    gemini_tts_voice_b: str = "Kore"
    notebooklm_work_dir: str = ""

    # ── Platform ────────────────────────────────────────────────────────
    vercel: Optional[str] = None

    @field_validator("llm_models", "app_access_keys", "allowed_origins", mode="before")
    @classmethod
    def _csv(cls, value):
        return _split_csv(value)

    @field_validator("llm_provider", "rate_limit_store", "tts_backend", mode="before")
    @classmethod
    def _lower(cls, value):
        return (value or "").strip().lower()

    # ── Derived values ─────────────────────────────────────────────────
    @property
    def on_vercel(self) -> bool:
        return bool(self.vercel)

    @property
    def llm_key(self) -> str:
        return self.llm_api_key or (self.gemini_api_key if self.llm_provider == "gemini" else "")

    @property
    def models(self) -> List[str]:
        if self.llm_models:
            return self.llm_models
        defaults = {"gemini": ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3-flash-preview"]}
        return defaults.get(self.llm_provider, [])

    @property
    def work_dir(self) -> str:
        """Writable dir for temp files. Serverless hosts mount the code read-only."""
        if self.notebooklm_work_dir:
            return self.notebooklm_work_dir
        if not self.on_vercel and os.access(PROJECT_ROOT, os.W_OK):
            return PROJECT_ROOT
        return os.path.join(tempfile.gettempdir(), "notebooklm")

    def summary(self) -> dict:
        """Redacted view for startup logs and GET /."""
        return {
            "llm": {"provider": self.llm_provider, "models": self.models, "configured": bool(self.llm_key)},
            "auth": "enabled" if self.app_access_keys else ("misconfigured" if self.on_vercel else "disabled"),
            "rateLimitStore": self.rate_limit_store,
            "blob": bool(self.blob_read_write_token),
            "tts": self.tts_backend or "auto",
        }


settings = Settings()


def reload_settings() -> Settings:
    """Re-read the environment into the shared instance (used by tests)."""
    fresh = Settings()
    for name in Settings.model_fields:
        setattr(settings, name, getattr(fresh, name))
    return settings
