# PLANRAUM — Backend (FastAPI)

The extraction API behind PLANRAUM. It reads a Bebauungsplan upload and returns
the building constraints as structured JSON — the exact contract the frontend's
`runExtraction()` seam consumes.

Today it returns the bundled **mock plan** (Bühl "Obere Au"), so the API is fully
usable for the demo before any AI model exists. Real extraction plugs into one
function: `app/services/extraction.py`.

## Run it

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- API docs (Swagger): http://localhost:8000/docs
- Health check: http://localhost:8000/health

## Endpoints

| Method | Path       | Body                     | Returns            |
| ------ | ---------- | ------------------------ | ------------------ |
| GET    | `/health`  | —                        | `{status, service}`|
| POST   | `/extract` | `multipart/form-data` `file=` (PDF/PNG/JPG/TIFF) | `ExtractionResult` |

Quick test:

```bash
curl -F "file=@some-plan.pdf" http://localhost:8000/extract
```

## The contract

`app/models.py` mirrors `frontend/src/types.ts` (camelCase keys on purpose).
`ExtractionResult` = plan metadata + a list of `Constraint`s + the Baufenster
footprint polygon (EPSG:4326). **Keep these in lockstep with the frontend.**

## Where real AI goes

`app/services/extraction.py → run_extraction(filename, content)`. Replace the
mock return with:

1. Render PDF/image pages (pdf2image / Pillow).
2. Locate the Nutzungsschablone + OCR (Tesseract or a vision model).
3. Extract constraints with an LLM (Claude) into the `Constraint` schema.
4. Geocode + reproject the Baufenster EPSG:25832 → EPSG:4326 (pyproj).

Return type stays `ExtractionResult`; nothing else changes.

## Connecting the frontend

Set `VITE_API_URL` in `frontend/.env` to point the app at this server:

```
VITE_API_URL=http://localhost:8000
```

With it set, the frontend POSTs real uploads to `/extract`; unset, it falls back
to the local mock simulation (demo-safe default).
