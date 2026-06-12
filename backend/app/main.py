"""PLANRAUM backend — FastAPI app.

Exposes the extraction API the frontend's runExtraction() seam will call. CORS is
open to the Vite dev server by default; override with the ALLOWED_ORIGINS env var
(comma-separated) in other environments.
"""

import os
from typing import Dict, List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import extract

app = FastAPI(
    title="PLANRAUM API",
    description="AI Bebauungsplan reader — extracts building constraints from zoning plans.",
    version="0.1.0",
)

_origins: List[str] = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(extract.router)


@app.get("/health", tags=["meta"])
async def health() -> Dict[str, str]:
    return {"status": "ok", "service": "planraum-api"}
