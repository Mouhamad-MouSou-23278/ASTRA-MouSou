"""Provider-agnostic speech (STT / TTS).

Default: "browser" - the frontend uses the Web Speech API (speech synthesis
works offline with the OS voices; typed input is always available). Optional:
any server speaking the OpenAI audio protocol, including self-hosted ones.
"""
from __future__ import annotations

from typing import Optional, Protocol

import httpx

from ..config import get_settings


class SpeechError(RuntimeError):
    pass


class SpeechProvider(Protocol):
    name: str

    def transcribe(self, audio: bytes, filename: str, content_type: str) -> str: ...

    def synthesize(self, text: str) -> tuple[bytes, str]: ...


class OpenAICompatibleSpeech:
    def __init__(self, base_url: str, api_key: str, stt_model: str, tts_model: str, voice: str) -> None:
        if not base_url:
            raise SpeechError("openai_compatible speech needs ASTRA_SPEECH_BASE_URL")
        self._base = base_url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self._stt_model, self._tts_model, self._voice = stt_model, tts_model, voice
        self.name = "openai_compatible"

    def transcribe(self, audio: bytes, filename: str, content_type: str) -> str:
        try:
            resp = httpx.post(
                f"{self._base}/audio/transcriptions", headers=self._headers, timeout=30.0,
                data={"model": self._stt_model, "language": "en"},
                files={"file": (filename or "speech.webm", audio, content_type or "audio/webm")},
            )
            resp.raise_for_status()
            return str(resp.json().get("text", "")).strip()
        except (httpx.HTTPError, ValueError) as exc:
            raise SpeechError(f"speech-to-text failed: {exc}") from exc

    def synthesize(self, text: str) -> tuple[bytes, str]:
        try:
            resp = httpx.post(
                f"{self._base}/audio/speech", headers=self._headers, timeout=30.0,
                json={"model": self._tts_model, "voice": self._voice, "input": text},
            )
            resp.raise_for_status()
            return resp.content, resp.headers.get("content-type", "audio/mpeg")
        except httpx.HTTPError as exc:
            raise SpeechError(f"text-to-speech failed: {exc}") from exc


def get_speech() -> Optional[SpeechProvider]:
    s = get_settings()
    if s.speech_provider.strip().lower() != "openai_compatible":
        return None
    try:
        return OpenAICompatibleSpeech(s.speech_base_url, s.speech_api_key, s.stt_model, s.tts_model,
                                      s.tts_voice)
    except SpeechError:
        return None


def speech_status() -> dict:
    provider = get_speech()
    return {
        "mode": "server" if provider else "browser",
        "provider": provider.name if provider else "browser-web-speech",
        "detail": ("Server speech provider active." if provider else
                   "Using the browser Web Speech API; typed chat always works."),
    }
