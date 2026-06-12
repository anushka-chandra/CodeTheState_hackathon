# PLANRAUM

**AI Bebauungsplan Reader & 3D Compliance Viewer** — Komm.ONE / IPAI Builder
Day, Heilbronn.

German zoning plans (_Bebauungspläne_) lock legally-binding building constraints
inside scanned PDFs — max height, roof type, GRZ/GFZ, the buildable footprint.
PLANRAUM reads those constraints, lets a planner verify and correct them, renders
the proposed building on a real 3D map among the city's existing buildings, and
checks each parameter for compliance — PASS / FAIL / REVIEW with the exact gap.

## Monorepo layout

```
.
├── frontend/   Vite + React + TS SPA (the whole demo, mock-first)
└── backend/    FastAPI extraction API (returns the same data contract)
```

The two halves meet at one seam: the frontend's `runExtraction()` calls the
backend's `POST /extract`, which returns an `ExtractionResult`. The frontend runs
fully on mock data with no backend at all — the backend is additive.

## Quick start

**Frontend** (the demo — works on its own):

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173  → click "Use example plan"
```

**Backend** (optional — real upload extraction):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000    # http://localhost:8000/docs
```

To connect them, set `VITE_API_URL=http://localhost:8000` in `frontend/.env`.
Unset, the frontend stays on the local mock simulation (demo-safe default).

## The contract

`backend/app/models.py` mirrors `frontend/src/types.ts` (camelCase keys). The
`ExtractionResult` shape — plan metadata, a list of constraints, and the
Baufenster footprint polygon — is the single source of truth shared by both
sides. Keep them in lockstep.

See [frontend/README.md](frontend/README.md) and
[backend/README.md](backend/README.md) for details on each half.
