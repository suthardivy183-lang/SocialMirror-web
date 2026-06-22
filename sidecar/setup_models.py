#!/usr/bin/env python3
"""
One-time setup: downloads and converts CrisperWhisper to CTranslate2.
Run this once before using verbatim filler transcription:
    python3 sidecar/setup_models.py

Needs ~8GB RAM during conversion, ~2GB disk for the final model.
HuggingFace cache for the source model is separate (~3GB in ~/.cache/huggingface/).
"""
import os, sys, subprocess

MODEL_CACHE = os.path.expanduser("~/.cache/socialmirror")
CRISPER_PATH = os.path.join(MODEL_CACHE, "crisperwhisper-ct2")
HF_MODEL = "nyrahealth/CrisperWhisper"

def write_preprocessor_config():
    """CrisperWhisper (large-v3) needs 128 mel bins but ships no preprocessor
    config; faster-whisper otherwise defaults to 80 and fails. Write the file."""
    import json
    cfg = {
        "chunk_length": 30,
        "feature_extractor_type": "WhisperFeatureExtractor",
        "feature_size": 128,
        "hop_length": 160,
        "n_fft": 400,
        "n_samples": 480000,
        "nb_max_frames": 3000,
        "padding_side": "right",
        "padding_value": 0.0,
        "processor_class": "WhisperProcessor",
        "return_attention_mask": False,
        "sampling_rate": 16000,
    }
    with open(os.path.join(CRISPER_PATH, "preprocessor_config.json"), "w") as f:
        json.dump(cfg, f, indent=2)


def main():
    if os.path.exists(CRISPER_PATH) and os.listdir(CRISPER_PATH):
        print(f"CrisperWhisper already cached at {CRISPER_PATH}")
        return

    print("Step 1/3 — Installing transformers & huggingface_hub...")
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "-q", "transformers", "huggingface_hub"],
        check=True,
    )

    os.makedirs(CRISPER_PATH, exist_ok=True)

    print(f"Step 2/3 — Downloading {HF_MODEL} from HuggingFace (~3 GB)...")
    print("         This may take 10-30 min depending on your connection.")

    print("Step 3/3 — Converting to CTranslate2 int8 format (~8 GB RAM needed)...")
    result = subprocess.run(
        [
            "ct2-transformers-converter",
            "--model", HF_MODEL,
            "--output_dir", CRISPER_PATH,
            "--quantization", "int8",
            "--force",
        ],
        capture_output=False,  # let output stream to terminal
        text=True,
    )

    if result.returncode != 0:
        print(f"\nConversion failed (exit {result.returncode}).")
        print("The app will fall back to medium.en + filler prompt instead.")
        # Clean up partial output so next run retries
        import shutil
        shutil.rmtree(CRISPER_PATH, ignore_errors=True)
        sys.exit(1)

    # CrisperWhisper is large-v3 based (128 mel bins) but ships no
    # preprocessor_config.json. Without this file, faster-whisper defaults to
    # 80 mels and the model errors with a feature-shape mismatch. Write it.
    write_preprocessor_config()

    print(f"\nDone! CrisperWhisper cached at: {CRISPER_PATH}")
    print("Restart the desktop app — it will now use verbatim transcription with fillers.")

if __name__ == "__main__":
    main()
