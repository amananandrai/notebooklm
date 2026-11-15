"""Narration for the 3D Video Studio: dialogue turns -> one WAV track.

Backends, in order of preference when TTS_BACKEND is not set:
  sapi   - Windows SAPI voices via PowerShell (Windows only)
  gemini - Gemini TTS API (any OS; needs GEMINI_API_KEY)
  espeak - espeak-ng / espeak command line (any OS; offline, robotic voice)
"""
import base64
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import wave
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional

from app.settings import settings

SAPI_SCRIPT = """
param([string]$TextBase64, [string]$VoiceName, [string]$OutputPath)
Add-Type -AssemblyName System.Speech
$text = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TextBase64))
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $synth.SelectVoice($VoiceName) } catch { }
$synth.Rate = -1
$synth.Volume = 100
$synth.SetOutputToWaveFile($OutputPath)
$synth.Speak($text)
$synth.SetOutputToNull()
$synth.Dispose()
"""


class TTSUnavailable(RuntimeError):
    pass


def _espeak_cmd() -> Optional[str]:
    return shutil.which("espeak-ng") or shutil.which("espeak")


def _tts_backend() -> Optional[str]:
    forced = settings.tts_backend
    if forced:
        return forced
    if os.name == "nt":
        return "sapi"
    if _gemini_key():
        return "gemini"
    if _espeak_cmd():
        return "espeak"
    return None


def _is_host_a(speaker) -> bool:
    s = str(speaker or "").lower()
    return "host a" in s or "alex" in s


def _tts_sapi(text: str, host_a: bool, out_path: str, temp_dir: str) -> None:
    script_path = os.path.join(temp_dir, "synthesize_turn.ps1")
    if not os.path.exists(script_path):
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(SAPI_SCRIPT)
    voice = "Microsoft David Desktop" if host_a else "Microsoft Zira Desktop"
    text_b64 = base64.b64encode(text.encode("utf-8")).decode("ascii")
    try:
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script_path,
             "-TextBase64", text_b64, "-VoiceName", voice, "-OutputPath", out_path],
            capture_output=True, text=True, timeout=90, check=False,
        )
    except FileNotFoundError:
        raise TTSUnavailable("TTS_BACKEND=sapi needs Windows PowerShell.")
    if result.returncode != 0 or not os.path.exists(out_path):
        raise RuntimeError((result.stderr or result.stdout or "Windows speech synthesis failed").strip())


def _gemini_key() -> str:
    # Gemini TTS needs a Gemini key even when text generation uses another provider.
    return settings.gemini_api_key or (settings.llm_api_key if settings.llm_provider == "gemini" else "")


def _tts_gemini(text: str, host_a: bool, out_path: str, temp_dir: str) -> None:
    if not _gemini_key():
        raise TTSUnavailable("TTS_BACKEND=gemini needs GEMINI_API_KEY.")
    payload = json.dumps({
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": (settings.gemini_tts_voice_a if host_a else settings.gemini_tts_voice_b)}}},
        },
    }).encode()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_tts_model}:generateContent"
    last_err = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, data=payload, method="POST",
                                         headers={"Content-Type": "application/json", "x-goog-api-key": _gemini_key()})
            data = json.loads(urllib.request.urlopen(req, timeout=90).read().decode())
            part = data["candidates"][0]["content"]["parts"][0]["inlineData"]
            pcm = base64.b64decode(part["data"])
            rate = int((re.search(r"rate=(\d+)", part.get("mimeType", "")) or [None, 24000])[1])
            with wave.open(out_path, "wb") as w:  # Gemini returns raw 16-bit mono PCM
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(rate)
                w.writeframes(pcm)
            return
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code in (429, 500, 503):
                time.sleep(1 + attempt)
                continue
            break
        except Exception as e:
            last_err = e
            break
    raise RuntimeError(f"Gemini TTS failed: {last_err}")


def _tts_espeak(text: str, host_a: bool, out_path: str, temp_dir: str) -> None:
    cmd = _espeak_cmd()
    if not cmd:
        raise TTSUnavailable("TTS_BACKEND=espeak needs espeak-ng (e.g. apt install espeak-ng).")
    text_path = out_path + ".txt"
    with open(text_path, "w", encoding="utf-8") as f:
        f.write(text)
    voice = "en-us+m3" if host_a else "en-us+f3"
    result = subprocess.run([cmd, "-v", voice, "-s", "165", "-f", text_path, "-w", out_path],
                            capture_output=True, text=True, timeout=90, check=False)
    if result.returncode != 0 or not os.path.exists(out_path):
        raise RuntimeError((result.stderr or "espeak failed").strip())


TTS_BACKENDS = {"sapi": _tts_sapi, "gemini": _tts_gemini, "espeak": _tts_espeak}


def _synthesize_video_audio(turns: List[dict]) -> dict:
    """Render every dialogue turn to speech and join them into one WAV track.

    Browser SpeechSynthesis is audible but does not expose its output as a
    MediaStream, so the video recorder needs real PCM audio from the server.
    """
    if not turns:
        raise ValueError("At least one dialogue turn is required")
    backend = _tts_backend()
    if backend is None:
        raise TTSUnavailable("No speech engine is available on the server. Set GEMINI_API_KEY (Gemini TTS), "
                             "install espeak-ng, or run the server on Windows.")
    synth = TTS_BACKENDS.get(backend)
    if synth is None:
        raise TTSUnavailable(f"Unknown TTS_BACKEND '{backend}'. Use one of: {', '.join(TTS_BACKENDS)}.")

    items = [(i, str(t.get("text", "")).strip(), _is_host_a(t.get("speaker"))) for i, t in enumerate(turns)]
    items = [it for it in items if it[1]]
    if not items:
        raise ValueError("Dialogue turns contain no text")

    temp_root = os.path.join(settings.work_dir, ".tmp_tts")
    os.makedirs(temp_root, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="notebooklm_tts_", dir=temp_root, ignore_cleanup_errors=True) as temp_dir:
        def render(item):
            index, text, host_a = item
            path = os.path.join(temp_dir, f"turn_{index}.wav")
            synth(text, host_a, path, temp_dir)
            return path

        # Network backends benefit from parallel requests; local engines are fast enough serially.
        workers = 4 if backend == "gemini" else 1
        with ThreadPoolExecutor(max_workers=workers) as pool:
            chunk_paths = list(pool.map(render, items))

        combined = bytearray()
        durations = []
        first_params = None
        pause_seconds = 0.5
        for index, chunk_path in enumerate(chunk_paths):
            with wave.open(chunk_path, "rb") as source:
                params = source.getparams()
                if first_params is None:
                    first_params = params
                elif (params.nchannels, params.sampwidth, params.framerate) != (first_params.nchannels, first_params.sampwidth, first_params.framerate):
                    raise RuntimeError("Speech chunks have mismatched audio formats")
                frames = source.readframes(source.getnframes())
                duration = source.getnframes() / source.getframerate()
                combined.extend(frames)
                if index < len(chunk_paths) - 1:
                    silence_frames = int(source.getframerate() * pause_seconds)
                    combined.extend(b"\x00" * silence_frames * source.getnchannels() * source.getsampwidth())
                    duration += pause_seconds
                durations.append(duration)

        output = io.BytesIO()
        with wave.open(output, "wb") as target:
            target.setnchannels(first_params.nchannels)
            target.setsampwidth(first_params.sampwidth)
            target.setframerate(first_params.framerate)
            target.writeframes(bytes(combined))

        return {
            "audioBase64": base64.b64encode(output.getvalue()).decode("ascii"),
            "durations": durations,
            "engine": backend,
        }
