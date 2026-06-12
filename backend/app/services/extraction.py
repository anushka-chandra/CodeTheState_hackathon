"""The extraction service — the single seam where real AI plugs in.

Right now this returns the bundled mock plan, so the API is fully usable for the
frontend demo before any model exists. When you build the real pipeline, replace
the body of `run_extraction` with:

  1. Render the PDF/image pages (e.g. pdf2image / Pillow).
  2. OCR + locate the Nutzungsschablone (e.g. Tesseract, or a vision model).
  3. Extract constraints with an LLM (Claude) into the Constraint schema.
  4. Geocode the plan area and reproject the Baufenster EPSG:25832 -> EPSG:4326
     (pyproj) into the footprint polygon.

Keep the return type as `ExtractionResult` — that is the frozen contract with
the frontend. Nothing else in the app needs to change.
"""

from app.models import ExtractionResult
from app.services.mock_plan import build_mock_plan


async def run_extraction(filename: str, content: bytes) -> ExtractionResult:
    """Read one Bebauungsplan and return structured constraints.

    Args:
        filename: original upload name (used later for format detection).
        content: raw file bytes (used later by the real pipeline).
    """
    # --- real AI pipeline goes here ---
    # For now, ignore the upload and return the demo plan so the contract is live.
    _ = (filename, content)
    return build_mock_plan()
