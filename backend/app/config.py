"""Runtime configuration, read from environment variables (prefix ASTRA_) or .env."""
from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent
DATA_DIR = BACKEND_DIR / "data"

APP_NAME = "ASTRA"
APP_VERSION = "1.0.0"
DATA_LABEL = "SIMULATED DATA"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ASTRA_",
        env_file=(str(REPO_DIR / ".env"), str(BACKEND_DIR / ".env")),
        extra="ignore",
    )

    # --- storage -------------------------------------------------------------
    # Empty -> a local SQLite file (zero-setup, fully offline). Docker Compose
    # sets this to PostgreSQL: postgresql+psycopg://user:pass@db:5432/astra
    database_url: str = ""

    # --- security ------------------------------------------------------------
    # Empty -> a random key is generated once and stored in backend/data/.
    secret_key: str = ""
    access_token_minutes: int = 480
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- demo / seed ---------------------------------------------------------
    seed_demo_data: bool = True
    demo_password: str = ""       # overrides the documented per-role demo passwords

    # --- paths ---------------------------------------------------------------
    frontend_dist: str = str(REPO_DIR / "frontend" / "dist")
    terrain_dir: str = str(BACKEND_DIR / "assets" / "terrain")

    # --- networking ----------------------------------------------------------
    # Base URL judges' phones should open (e.g. http://192.168.1.20:8000).
    # Empty -> derived from the request / detected LAN address.
    public_base_url: str = ""

    # --- LLM (provider-agnostic; "local" is a deterministic offline engine) ---
    llm_provider: str = "local"   # local | openrouter | groq | gemini | anthropic | openai_compatible
    llm_model: str = ""           # empty -> provider default
    llm_base_url: str = ""        # openai_compatible only, e.g. http://localhost:11434/v1
    llm_api_key: str = ""         # openai_compatible only
    llm_timeout_s: float = 25.0

    # --- speech (browser Web Speech API is the built-in local fallback) -------
    speech_provider: str = "browser"   # browser | openai_compatible
    speech_base_url: str = ""
    speech_api_key: str = ""
    stt_model: str = "whisper-1"
    tts_model: str = "tts-1"
    tts_voice: str = "alloy"

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{(DATA_DIR / 'astra.db').as_posix()}"

    @property
    def resolved_secret_key(self) -> str:
        if self.secret_key:
            return self.secret_key
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        key_file = DATA_DIR / "secret.key"
        if not key_file.exists():
            key_file.write_text(secrets.token_urlsafe(48), encoding="utf-8")
        return key_file.read_text(encoding="utf-8").strip()

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
