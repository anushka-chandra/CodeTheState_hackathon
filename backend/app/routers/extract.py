"""POST /api/extract — accept base64 page images, return structured constraints."""

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models import ExtractionResult
from app.services.extraction import run_extraction_from_images

logger = logging.getLogger(__name__)
router = APIRouter(tags=["extraction"])


class ExtractRequest(BaseModel):
    images: List[str]
    filename: Optional[str] = None


@router.post("/api/extract", response_model=ExtractionResult)
async def extract(body: ExtractRequest) -> ExtractionResult:
    if not body.images:
        raise HTTPException(status_code=400, detail="No page images provided")
    try:
        return await run_extraction_from_images(body.images)
    except RuntimeError as e:
        logger.error("Extraction runtime error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
    except ValueError as e:
        logger.error("Extraction value error: %s", e)
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error("Extraction failed: %s: %s", type(e).__name__, e, exc_info=True)
        raise HTTPException(status_code=502, detail=f"Extraction failed: {type(e).__name__}")
