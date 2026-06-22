"""
SocialMirror transcription API.

Job-based so heavy CPU work never blocks the request:
  POST /transcribe   -> { job_id, status: "queued" }
  GET  /status/{id}  -> { status, progress, message }
  GET  /result/{id}  -> final JSON when done
  GET  /health       -> instant, even before models load
  POST /transcribe-sync -> blocking, for local curl testing only
"""
from __future__ import annotations

import os
import tempfile
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from services import jobs
from services.jobs import PipelineError
from services import audio_utils as au
from services.pipeline import run_pipeline

load_dotenv()

app = FastAPI(title="SocialMirror API", version="1.0")

# Default to allow-all for the MVP public API (no cookies/credentials used). Set
# CORS_ORIGINS to a comma-separated allowlist to restrict.
_origins_env = os.environ.get("CORS_ORIGINS", "*").strip()
_origins = ["*"] if _origins_env == "*" else [o.strip() for o in _origins_env.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(tempfile.gettempdir(), "socialmirror_uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _err(code: str, message: str, status: int = 400) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": code, "message": message})


@app.get("/health")
def health() -> dict:
    # Must be instant — never touches the models.
    return {"status": "ok", "model": os.environ.get("MODEL_SIZE", "medium")}


async def _save_and_prepare(file: UploadFile, num_speakers) -> tuple[str, float, int | None]:
    """Validate + persist the upload, normalize to mono 16k WAV. Returns
    (wav_path, duration, num_speakers) or raises PipelineError."""
    au.validate_extension(file.filename or "")

    raw = await file.read()
    au.validate_size(len(raw))

    base = os.path.join(UPLOAD_DIR, uuid.uuid4().hex)
    src_path = base + os.path.splitext(file.filename or "")[1].lower()
    with open(src_path, "wb") as f:
        f.write(raw)

    duration = au.validate_duration(src_path)
    wav_path = au.to_mono_16k_wav(src_path, base + ".wav")
    try:
        os.remove(src_path)
    except OSError:
        pass

    ns: int | None = None
    if num_speakers not in (None, "", "0", 0):
        try:
            ns = int(num_speakers)
        except (TypeError, ValueError):
            ns = None
    return wav_path, duration, ns


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), num_speakers: str | None = Form(None)):
    try:
        wav_path, duration, ns = await _save_and_prepare(file, num_speakers)
    except PipelineError as e:
        return _err(e.code, str(e))

    job = jobs.submit(run_pipeline, wav_path, ns, duration)
    if job is None:
        return _err("server_busy", "Another transcription is in progress. Try again shortly.", status=429)
    return {"job_id": job.id, "status": jobs.QUEUED}


@app.get("/status/{job_id}")
def status(job_id: str):
    job = jobs.get(job_id)
    if job is None:
        return _err("not_found", "Unknown job id.", status=404)
    return job.public()


@app.get("/result/{job_id}")
def result(job_id: str):
    job = jobs.get(job_id)
    if job is None:
        return _err("not_found", "Unknown job id.", status=404)
    if job.status == jobs.ERROR:
        return _err(job.error or "pipeline_error", job.message, status=500)
    if job.status != jobs.DONE:
        return _err("not_ready", f"Job is {job.status}.", status=409)
    return job.result


@app.post("/transcribe-sync")
async def transcribe_sync(file: UploadFile = File(...), num_speakers: str | None = Form(None)):
    """Blocking variant for local curl testing. Not used by the frontend."""
    try:
        wav_path, duration, ns = await _save_and_prepare(file, num_speakers)
        result = run_pipeline(wav_path, ns, duration, progress=lambda f, m: None)
        return result
    except PipelineError as e:
        return _err(e.code, str(e))
