"""Slide / infographic images.

Images come from Pollinations' free endpoint. When ``BLOB_READ_WRITE_TOKEN`` is set
(Vercel Blob), the server downloads each image once and stores it, so:

* the artifact keeps the same image forever (Pollinations regenerates per request),
* viewers' browsers never call Pollinations (no per-viewer rate limits, and document
  topics are not sent to a third party from every viewer).

Any failure falls back to the plain Pollinations URL, so generation never breaks.
Upload protocol mirrors the official ``@vercel/blob`` client (API version 13).
"""
import hashlib
import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional

from app.settings import settings

POLLINATIONS = "https://image.pollinations.ai/prompt/"
BLOB_API = "https://vercel.com/api/blob/"
BLOB_API_VERSION = "13"


def pollinations_url(prompt: str, width: int, height: int, seed: int) -> str:
    # The free endpoint serves one model and caps the area at ~768x768 (aspect kept);
    # `model=` and `nologo` are ignored without a key, so they are not sent.
    encoded = urllib.parse.quote(prompt[:400])
    return f"{POLLINATIONS}{encoded}?width={width}&height={height}&seed={seed}"


def _fetch(url: str, timeout: int = 60) -> Optional[tuple]:
    req = urllib.request.Request(url, headers={"User-Agent": "notebooklm-studio"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        ctype = resp.headers.get("Content-Type", "image/jpeg").split(";")[0]
        if not ctype.startswith("image/"):
            return None
        return resp.read(), ctype


def _store_id(token: str) -> str:
    parts = token.split("_")
    return parts[3] if len(parts) > 3 else ""


def upload_to_blob(data: bytes, pathname: str, content_type: str) -> str:
    token = settings.blob_read_write_token
    req = urllib.request.Request(
        f"{BLOB_API}?{urllib.parse.urlencode({'pathname': pathname})}",
        data=data, method="PUT",
        headers={
            "authorization": f"Bearer {token}",
            "x-api-version": BLOB_API_VERSION,
            "x-vercel-blob-store-id": _store_id(token),
            "x-vercel-blob-access": "public",
            "x-content-type": content_type,
            "x-add-random-suffix": "0",
            "x-allow-overwrite": "1",
            "x-content-length": str(len(data)),
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())["url"]


def image_for_prompt(prompt: str, width: int = 1280, height: int = 720, seed: int = 42, model: str = "") -> str:
    """URL for an image of `prompt`: a stored Blob URL when possible, else Pollinations."""
    url = pollinations_url(prompt, width, height, seed)
    if not settings.blob_read_write_token:
        try:  # warm the image so the viewer's first load is fast
            urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=10)
        except Exception:
            pass
        return url
    try:
        fetched = _fetch(url)
        if not fetched:
            return url
        data, ctype = fetched
        digest = hashlib.sha256(f"{prompt}|{width}|{height}|{seed}".encode()).hexdigest()[:24]
        ext = {"image/png": "png", "image/webp": "webp"}.get(ctype, "jpg")
        return upload_to_blob(data, f"notebooklm/images/{digest}.{ext}", ctype)
    except Exception as exc:
        print(f"[images] Blob storage failed, using Pollinations URL: {exc.__class__.__name__}: {exc}")
        return url
