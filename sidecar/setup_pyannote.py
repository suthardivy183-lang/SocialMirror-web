#!/usr/bin/env python3
"""
Enable the high-quality pyannote diarization engine.

pyannote's models are gated on HuggingFace, so this needs a one-time setup:

  1. Create a free HuggingFace account:  https://huggingface.co/join
  2. Accept the conditions on BOTH model pages (click "Agree"):
       https://huggingface.co/pyannote/speaker-diarization-3.1
       https://huggingface.co/pyannote/segmentation-3.0
  3. Create a read token:  https://huggingface.co/settings/tokens
  4. Export it and run this script to verify:
       export HF_TOKEN=hf_xxx
       python3 sidecar/setup_pyannote.py

Once verified, the desktop app automatically uses pyannote (instead of the
ECAPA fallback) whenever HF_TOKEN is set in the environment.
"""
import os
import sys


def main():
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
    if not token:
        print("HF_TOKEN is not set.\n")
        print(__doc__)
        sys.exit(1)

    print("Found HF_TOKEN. Loading pyannote/speaker-diarization-3.1…")
    try:
        from pyannote.audio import Pipeline
    except Exception as e:
        print(f"pyannote.audio is not installed: {e}")
        print("Install it with:  pip3 install pyannote.audio")
        sys.exit(1)

    try:
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1", use_auth_token=token
        )
    except Exception as e:
        print(f"\nFailed to load the model: {e}\n")
        print("Most likely you haven't accepted the model conditions yet.")
        print("Accept BOTH, then re-run:")
        print("  https://huggingface.co/pyannote/speaker-diarization-3.1")
        print("  https://huggingface.co/pyannote/segmentation-3.0")
        sys.exit(1)

    if pipeline is None:
        print("\nModel returned None — conditions probably not accepted yet.")
        sys.exit(1)

    print("\n✓ pyannote is ready. The desktop app will now use it for diarization")
    print("  whenever HF_TOKEN is set. Re-run a session to see the difference.")


if __name__ == "__main__":
    main()
