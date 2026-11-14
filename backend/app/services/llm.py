"""Provider-agnostic LLM access.

ASTRA never depends on an LLM: `get_llm()` returns None when the provider is
"local" (the default) or cannot be initialised, and every caller then uses its
deterministic implementation. Adding a provider means adding one class with a
`complete` method and one branch in `_build`.
"""
from __future__ import annotations

import logging
from typing import Optional, Protocol

import httpx

from ..config import get_settings

log = logging.getLogger("astra.llm")


class LLMError(RuntimeError):
    """Any failure to obtain a usable completion (callers fall back to local)."""


class LLMProvider(Protocol):
    name: str

    def complete(self, system: str, messages: list[dict[str, str]]) -> str:
        """Return the assistant text for a system prompt and user/assistant turns."""
        ...


class AnthropicProvider:
    """Claude via the official Anthropic SDK (credentials resolved by the SDK)."""

    DEFAULT_MODEL = "claude-opus-5-5"
    # Models that accept the server-side refusal fallback parameter.
    _FALLBACK_MODELS = {
        "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-2", "claude-fable-5-1",
    }

    def __init__(self, model: str, timeout_s: float) -> None:
        import anthropic  # imported lazily so offline installs never need it

        self._sdk = anthropic
        self._client = anthropic.Anthropic(timeout=timeout_s, max_retries=1)
        self.model = model or self.DEFAULT_MODEL
        self.name = f"anthropic:{self.model}"

    def complete(self, system: str, messages: list[dict[str, str]]) -> str:
        sdk = self._sdk
        # Live voice/chat answers favour latency, so effort is set explicitly low.
        request = dict(
            model=self.model,
            max_tokens=16000,
            system=system,
            messages=messages,
            output_config={"effort": "low"},
        )
        try:
            if self.model in self._FALLBACK_MODELS:
                # If a safety classifier declines, let the API retry on its
                # default fallback model inside the same call.
                response = self._client.beta.messages.create(
                    betas=["server-side-fallback-2026-07-01"], fallbacks="default", **request
                )
            else:
                response = self._client.messages.create(**request)
        except sdk.AuthenticationError as exc:
            raise LLMError("Anthropic credentials were rejected") from exc
        except sdk.PermissionDeniedError as exc:
            raise LLMError("Anthropic credentials lack permission for this model") from exc
        except sdk.NotFoundError as exc:
            raise LLMError(f"Anthropic model '{self.model}' was not found") from exc
        except sdk.RateLimitError as exc:
            raise LLMError("Anthropic rate limit reached") from exc
        except sdk.APIStatusError as exc:
            raise LLMError(f"Anthropic API error (HTTP {exc.status_code})") from exc
        except sdk.APIConnectionError as exc:
            raise LLMError("Could not reach the Anthropic API (offline?)") from exc
        except sdk.AnthropicError as exc:
            raise LLMError(f"Anthropic client error: {exc}") from exc
        except Exception as exc:  # e.g. an SDK too old for a request field: degrade, never crash
            raise LLMError(f"Anthropic SDK call failed: {type(exc).__name__}") from exc

        if response.stop_reason == "refusal":
            raise LLMError("The model declined this request")
        text = "".join(block.text for block in response.content if block.type == "text").strip()
        if not text:
            raise LLMError("The model returned no text")
        return text


class OpenAICompatibleProvider:
    """Any server speaking the OpenAI chat-completions protocol.

    Intended for locally hosted open models (Ollama, LM Studio, vLLM, ...), which
    keeps the LLM path available with no internet connection.
    """

    def __init__(self, base_url: str, api_key: str, model: str, timeout_s: float) -> None:
        if not base_url or not model:
            raise LLMError("openai_compatible needs ASTRA_LLM_BASE_URL and ASTRA_LLM_MODEL")
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self._timeout = timeout_s
        self.model = model
        self.name = f"openai_compatible:{model}"

    def complete(self, system: str, messages: list[dict[str, str]]) -> str:
        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, *messages],
            "temperature": 0.2,
        }
        try:
            resp = httpx.post(self._url, json=payload, headers=self._headers, timeout=self._timeout)
            resp.raise_for_status()
            text = resp.json()["choices"][0]["message"]["content"]
        except httpx.HTTPStatusError as exc:
            raise LLMError(f"LLM server returned HTTP {exc.response.status_code}") from exc
        except httpx.HTTPError as exc:
            raise LLMError("Could not reach the LLM server") from exc
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise LLMError("LLM server returned an unexpected response") from exc
        if not isinstance(text, str) or not text.strip():
            raise LLMError("LLM server returned no text")
        return text.strip()


class GroqProvider(OpenAICompatibleProvider):
    DEFAULT_MODEL = "llama-3.3-70b-versatile"

    def __init__(self, api_key: str, model: str, timeout_s: float) -> None:
        super().__init__(
            base_url="https://api.groq.com/openai/v1",
            api_key=api_key,
            model=model or self.DEFAULT_MODEL,
            timeout_s=timeout_s,
        )
        self.name = f"groq:{self.model}"


class GeminiProvider:
    """Google Gemini via REST API."""

    DEFAULT_MODEL = "gemini-1.5-flash"

    def __init__(self, api_key: str, model: str, timeout_s: float) -> None:
        if not api_key:
            raise LLMError("Gemini requires GEMINI_API_KEY or ASTRA_LLM_API_KEY")
        self.api_key = api_key
        self.model = model or self.DEFAULT_MODEL
        self.timeout = timeout_s
        self.name = f"gemini:{self.model}"
        self._url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"

    def complete(self, system: str, messages: list[dict[str, str]]) -> str:
        contents = []
        if system:
            contents.append({"role": "user", "parts": [{"text": f"SYSTEM INSTRUCTION: {system}"}]})
            contents.append({"role": "model", "parts": [{"text": "Understood. I will follow all instructions."}]})
        for m in messages:
            role = "model" if m["role"] == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": m["content"]}]})

        payload = {"contents": contents, "generationConfig": {"temperature": 0.2, "maxOutputTokens": 4096}}
        try:
            resp = httpx.post(self._url, json=payload, timeout=self.timeout)
            resp.raise_for_status()
            data = resp.json()
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except Exception as exc:
            raise LLMError(f"Gemini API error: {exc}") from exc


_cache: dict[tuple, tuple[Optional[LLMProvider], str]] = {}


def _build() -> tuple[Optional[LLMProvider], str]:
    s = get_settings()
    provider = s.llm_provider.strip().lower()
    if provider in ("", "local", "none"):
        return None, "Deterministic local engine (no LLM configured)."
    try:
        if provider == "anthropic":
            return AnthropicProvider(s.llm_model, s.llm_timeout_s), "ready"
        if provider in ("gemini", "google"):
            import os
            key = s.llm_api_key or os.getenv("GEMINI_API_KEY", "")
            return GeminiProvider(key, s.llm_model, s.llm_timeout_s), "ready"
        if provider == "groq":
            import os
            key = s.llm_api_key or os.getenv("GROQ_API_KEY", "")
            return GroqProvider(key, s.llm_model, s.llm_timeout_s), "ready"
        if provider in ("openai_compatible", "openai"):
            base = s.llm_base_url or ("https://api.openai.com/v1" if provider == "openai" else "")
            return (
                OpenAICompatibleProvider(base, s.llm_api_key, s.llm_model, s.llm_timeout_s),
                "ready",
            )
        return None, f"Unknown ASTRA_LLM_PROVIDER '{s.llm_provider}'; using the local engine."
    except Exception as exc:  # missing SDK, missing credentials, bad config
        log.warning("LLM provider '%s' unavailable: %s", provider, exc)
        return None, f"Provider '{provider}' could not be initialised ({exc}); using the local engine."


def get_llm() -> Optional[LLMProvider]:
    s = get_settings()
    key = (s.llm_provider, s.llm_model, s.llm_base_url)
    if key not in _cache:
        _cache[key] = _build()
    return _cache[key][0]


def llm_status() -> dict:
    provider = get_llm()
    s = get_settings()
    detail = _cache[(s.llm_provider, s.llm_model, s.llm_base_url)][1]
    return {
        "configured": s.llm_provider or "local",
        "active": provider.name if provider else "local-deterministic",
        "llm_available": provider is not None,
        "detail": detail,
    }
