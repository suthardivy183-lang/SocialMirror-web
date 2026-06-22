"""
Single-worker job queue for transcription.

ML on CPU is heavy, so we run **one job at a time** on a background thread
(`ThreadPoolExecutor(max_workers=1)`) and reject new work while a job is in
flight (`server_busy`). The HTTP handlers stay instant; clients poll /status.
"""
from __future__ import annotations

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

# Job lifecycle states.
QUEUED = "queued"
RUNNING = "running"
DONE = "done"
ERROR = "error"

_executor = ThreadPoolExecutor(max_workers=1)
_jobs: dict[str, "Job"] = {}
_lock = threading.Lock()

# How many finished jobs to keep before evicting the oldest (memory hygiene).
_MAX_KEPT = 50


@dataclass
class Job:
    id: str
    status: str = QUEUED
    progress: float = 0.0          # 0..1
    message: str = "queued"
    result: Optional[dict] = None
    error: Optional[str] = None     # machine code, e.g. "server_busy"
    _order: int = 0

    def public(self) -> dict:
        return {
            "job_id": self.id,
            "status": self.status,
            "progress": round(self.progress, 3),
            "message": self.message,
            "error": self.error,
        }


_counter = 0


def _is_busy_locked() -> bool:
    return any(j.status in (QUEUED, RUNNING) for j in _jobs.values())


def submit(fn: Callable[..., dict], *args: Any) -> Optional[Job]:
    """Enqueue a pipeline run. Returns the Job, or None if the worker is busy.

    `fn(*args, progress=callback)` must accept a `progress(fraction, message)`
    keyword and return the final result dict.
    """
    global _counter
    with _lock:
        if _is_busy_locked():
            return None
        _counter += 1
        job = Job(id=uuid.uuid4().hex, _order=_counter)
        _jobs[job.id] = job
        _evict_old_locked()
    _executor.submit(_run, job.id, fn, *args)
    return job


def _run(job_id: str, fn: Callable[..., dict], *args: Any) -> None:
    job = _jobs.get(job_id)
    if job is None:
        return
    job.status = RUNNING
    job.message = "starting"

    def progress(fraction: float, message: str) -> None:
        job.progress = max(0.0, min(1.0, fraction))
        job.message = message

    try:
        result = fn(*args, progress=progress)
        job.result = result
        job.status = DONE
        job.progress = 1.0
        job.message = "done"
    except Exception as e:  # surface a clean message; full trace stays in logs
        job.status = ERROR
        job.error = getattr(e, "code", "pipeline_error")
        job.message = str(e)
        import traceback
        traceback.print_exc()


def get(job_id: str) -> Optional[Job]:
    return _jobs.get(job_id)


def _evict_old_locked() -> None:
    if len(_jobs) <= _MAX_KEPT:
        return
    finished = sorted(
        (j for j in _jobs.values() if j.status in (DONE, ERROR)),
        key=lambda j: j._order,
    )
    while len(_jobs) > _MAX_KEPT and finished:
        victim = finished.pop(0)
        _jobs.pop(victim.id, None)


class PipelineError(Exception):
    """Raised by pipeline stages with a machine-readable `code`."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
