"""Narration endpoint for the 3D Video Studio."""
import asyncio

from fastapi import APIRouter, Depends, HTTPException

from app import tts
from app.schemas import TTSRequest
from app.security import limit

router = APIRouter(prefix="/api")


@router.post("/tts", dependencies=[Depends(limit("tts"))])
async def synthesize(request: TTSRequest):
    try:
        # Speech synthesis blocks for seconds per turn; keep the event loop free.
        return await asyncio.to_thread(tts._synthesize_video_audio, request.turns)
    except tts.TTSUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Video narration is unavailable: {exc}")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        print(f"[TTS Error] {exc}")
        raise HTTPException(status_code=500, detail=f"Video narration failed: {exc}")
