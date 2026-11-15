"""Provider-neutral text generation.

``complete(prompt, json_mode=..., expect="object"|"array")`` returns the model's text.
Providers:

* ``gemini``        - Google Gemini REST API (``LLM_API_KEY`` or ``GEMINI_API_KEY``)
* ``openai_compat`` - any OpenAI-compatible ``/chat/completions`` API (OpenAI, Groq,
                      OpenRouter, Mistral, Together, DeepSeek, Cloudflare, Ollama, ...)
* ``anthropic``     - Anthropic Messages API

Models are tried in ``LLM_MODELS`` order. 429/5xx responses are retried with
back-off (honouring ``Retry-After``); if every model is rate-limited the caller
gets ``LLMQuotaError`` so the UI can say so instead of waiting minutes.
"""
import json
import threading
import time
import urllib.error
import urllib.request
from typing import Callable, Dict, List, Optional, Tuple

from app.settings import settings

RETRYABLE = (429, 500, 502, 503, 504)
_local = threading.local()


def last_model() -> str:
    """Model that answered this thread's most recent successful call."""
    return getattr(_local, "model", "")


class LLMError(RuntimeError):
    pass


class LLMNotConfigured(LLMError):
    pass


class LLMQuotaError(LLMError):
    def __init__(self, message: str, retry_after: int = 60):
        super().__init__(message)
        self.retry_after = retry_after


def require_configured() -> None:
    if not settings.llm_key:
        name = "GEMINI_API_KEY (or LLM_API_KEY)" if settings.llm_provider == "gemini" else "LLM_API_KEY"
        raise LLMNotConfigured(f"{name} is not set on the server. Add it to .env (or the host's environment) and restart.")
    if settings.llm_provider not in PROVIDERS:
        raise LLMNotConfigured(f"Unknown LLM_PROVIDER '{settings.llm_provider}'. Use one of: {', '.join(PROVIDERS)}.")
    if settings.llm_provider == "openai_compat" and not settings.llm_base_url:
        raise LLMNotConfigured("LLM_BASE_URL is required when LLM_PROVIDER=openai_compat.")
    if not settings.models:
        raise LLMNotConfigured("LLM_MODELS is empty; list at least one model.")


def _post(url: str, headers: dict, body: dict) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=settings.llm_timeout_s) as resp:
        return json.loads(resp.read().decode())


def _gemini(model: str, prompt: str, json_mode: bool, expect: str) -> str:
    cfg = {"temperature": settings.llm_temperature, "maxOutputTokens": settings.llm_max_output_tokens}
    if json_mode:
        cfg["responseMimeType"] = "application/json"  # Gemini allows objects and arrays
    data = _post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                 {"x-goog-api-key": settings.llm_key},
                 {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": cfg})
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        reason = (data.get("candidates") or [{}])[0].get("finishReason") or data.get("promptFeedback")
        raise LLMError(f"{model} returned no text ({reason})")


def _openai_compat(model: str, prompt: str, json_mode: bool, expect: str) -> str:
    body = {"model": model, "max_tokens": settings.llm_max_output_tokens, "temperature": settings.llm_temperature,
            "messages": [{"role": "user", "content": prompt}]}
    if json_mode and expect == "object":
        # json_object mode only permits a top-level object; array tools rely on parse_json.
        body["response_format"] = {"type": "json_object"}
    data = _post(f"{settings.llm_base_url.rstrip('/')}/chat/completions",
                 {"Authorization": f"Bearer {settings.llm_key}"}, body)
    return data["choices"][0]["message"]["content"] or ""


def _anthropic(model: str, prompt: str, json_mode: bool, expect: str) -> str:
    data = _post("https://api.anthropic.com/v1/messages",
                 {"x-api-key": settings.llm_key, "anthropic-version": "2023-06-01"},
                 {"model": model, "max_tokens": settings.llm_max_output_tokens,
                  "temperature": settings.llm_temperature,
                  "messages": [{"role": "user", "content": prompt}]})
    return "".join(block.get("text", "") for block in data.get("content", []))


PROVIDERS: Dict[str, Callable[[str, str, bool, str], str]] = {
    "gemini": _gemini, "openai_compat": _openai_compat, "anthropic": _anthropic,
}


def _retry_after(err: urllib.error.HTTPError, attempt: int) -> float:
    value = err.headers.get("Retry-After") if err.headers else None
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(2 ** attempt)


def complete_with_model(prompt: str, json_mode: bool = False, expect: str = "object",
                        models: Optional[List[str]] = None) -> Tuple[str, str]:
    """Return (text, model used)."""
    require_configured()
    call = PROVIDERS[settings.llm_provider]
    chain = [m for m in (models or settings.models) if m]
    last_err: Optional[Exception] = None
    rate_limited, max_wait = 0, 0.0
    for model in chain:
        for attempt in range(3):
            try:
                text = call(model, prompt, json_mode, expect)
                _local.model = model
                return text, model
            except urllib.error.HTTPError as err:
                last_err = err
                print(f"[LLM] {settings.llm_provider}/{model} HTTP {err.code} (attempt {attempt + 1})")
                if err.code not in RETRYABLE:
                    break  # bad request / auth / unknown model: try the next model
                wait = _retry_after(err, attempt)
                if err.code == 429:
                    max_wait = max(max_wait, wait)
                    if wait > 20:  # long quota wait: don't block, move on to the next model
                        break
                if attempt < 2:
                    time.sleep(min(wait, 20))
            except LLMError as err:
                last_err = err
                break
            except Exception as err:  # timeouts, network errors, malformed responses
                last_err = err
                print(f"[LLM] {settings.llm_provider}/{model} failed: {err.__class__.__name__}: {err}")
                break
        if isinstance(last_err, urllib.error.HTTPError) and last_err.code == 429:
            rate_limited += 1
    if chain and rate_limited == len(chain):
        raise LLMQuotaError("The AI provider's rate limit or quota is exhausted for every configured model. "
                            "Try again later.", retry_after=int(max(max_wait, 30)))
    raise LLMError(f"All models failed: {last_err}")


def complete(prompt: str, json_mode: bool = False, expect: str = "object",
             models: Optional[List[str]] = None) -> str:
    return complete_with_model(prompt, json_mode=json_mode, expect=expect, models=models)[0]
