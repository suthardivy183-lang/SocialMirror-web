# SocialMirror transcription backend.
# Runs locally (M2) and on HuggingFace Spaces (Docker SDK, port 7860).
FROM python:3.11-slim

# ffmpeg is required for audio decoding/normalization.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg git \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first for layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code.
COPY . .

# HuggingFace Spaces sends traffic to 7860; honor $PORT elsewhere.
ENV PORT=7860
ENV MODEL_SIZE=medium DEVICE=cpu COMPUTE_TYPE=int8
# Cache models inside the container's writable home.
ENV HF_HOME=/app/.cache/huggingface

EXPOSE 7860

# Single worker: the app already serializes ML jobs; multiple workers would each
# load the models and blow up memory.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860} --workers 1"]
