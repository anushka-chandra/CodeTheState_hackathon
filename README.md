# PLANRAUM

**AI Bebauungsplan Reader & 3D Compliance Viewer** — Komm.ONE / IPAI Builder
Day, Heilbronn.

German zoning plans (_Bebauungspläne_) lock legally-binding building constraints
inside scanned PDFs — max height, roof type, GRZ/GFZ, Vollgeschosse, Bauweise,
the buildable footprint. PLANRAUM reads those constraints with a vision model,
lets a planner verify and correct them, renders the proposed building on a real
3D map, and checks each parameter for compliance — PASS / FAIL / REVIEW with the
exact gap.

## Architecture

```
.
├── api/        Vercel serverless function — POST /api/extract (real extraction)
├── frontend/   Vite + React + TS SPA (the whole UI)
└── backend/    ⚠️ LEGACY — old FastAPI service, deprecated, will be removed
```

Extraction is a **Vercel serverless function**, not a separate server. The flow
is one path:

1. The browser renders the uploaded plan (PDF/PNG/JPG) to page images.
2. It POSTs them to `/api/extract` (same-origin Vercel function).
3. The function calls a vision model via an OpenAI-compatible gateway, parses the
   JSON, normalises it, and returns an `ExtractionResult`.

**`frontend/src/types.ts` is the single source of truth** for the
`ExtractionResult` contract (now including a `zones` array for plans with several
Nutzungsschablonen). The serverless function imports that type directly. The
legacy `backend/` is no longer kept in sync and should not be used.

### Fallback (the only one)

If the live call fails for **any** reason — bad key, no credits, timeout, bad
JSON, network, unrenderable file, or running plain `vite dev` with no function —
the app silently serves the bundled **cached example** and shows a small
"showing cached example" notice. It never shows a broken screen. The old
mock-mode / `VITE_API_URL` switch is gone.

## Environment variables

Server-side only (the function), set in the **root `.env`** for local dev and in
**Vercel → Settings → Environment Variables** for deploys. Never prefixed with
`VITE_`, never in the client bundle, never logged. See [.env.example](.env.example).

| Var | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | yes | key for the OpenAI-compatible gateway |
| `OPENAI_BASE_URL` | no | gateway `/v1` base (defaults to OpenAI) |
| `OPENAI_MODEL` | no | vision model (default `stackit-qwen-qwen3-vl-235b-a22b-instruct-fp8`) |

The real `.env` is gitignored. The frontend needs **no** keys or URLs.

## Run it

**Full stack locally** (real extraction) — Vercel CLI serves the app + function:

```bash
npm install                 # root deps for the function (openai)
cp .env.example .env         # then fill in OPENAI_API_KEY
vercel dev                   # http://localhost:3000
```

**Frontend only** (fast UI iteration) — extraction always falls back to the
cached example:

```bash
cd frontend && npm install && npm run dev    # http://localhost:5173
```

Either way, "Use example plan" walks the whole flow with bundled demo data.

**Deploy:** push to a Vercel project pointed at this repo root. `vercel.json`
builds the frontend (`frontend/dist`) and deploys `api/extract.ts` as a function.
Set the three env vars in the dashboard.

## Zones

A plan with multiple zones returns each in `zones[]`. The Review screen shows a
zone picker; the compliance check uses the selected zone's values.

See [frontend/README.md](frontend/README.md) for the UI details. `backend/` is
retained only as reference and is **deprecated**.
