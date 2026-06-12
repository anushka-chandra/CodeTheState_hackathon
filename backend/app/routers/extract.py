"""POST /extract — accept a Bebauungsplan upload, return structured constraints."""

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.models import ExtractionResult
from app.services.extraction import run_extraction

router = APIRouter(tags=["extraction"])

_ACCEPTED = (".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff")


@router.post("/extract", response_model=ExtractionResult)
async def extract(file: UploadFile = File(...)) -> ExtractionResult:
    name = (file.filename or "").lower()
    if not name.endswith(_ACCEPTED):
        raise HTTPException(
            status_code=415,
            detail="Unsupported file. Use a PDF, PNG, JPG or TIFF plan export.",
        )
    content = await file.read()
    return await run_extraction(file.filename or "upload", content)
