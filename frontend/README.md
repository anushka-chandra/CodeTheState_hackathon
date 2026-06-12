# PLANRAUM

**AI Bebauungsplan Reader & 3D Compliance Viewer** — Komm.ONE / IPAI Builder Day, Heilbronn.

German zoning plans (_Bebauungspläne_) lock legally-binding building constraints
inside scanned PDFs. PLANRAUM reads those constraints, lets a planner verify and
correct them, renders the proposed building on a real 3D map among the city's
existing buildings, and checks each parameter for compliance — PASS / FAIL /
REVIEW with the exact gap shown.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

No backend, no API keys required. Click **"Use example plan"** on the Upload
screen to walk the entire flow with bundled demo data.

## The flow

`Upload → Extract → Review → 3D & Compliance` (stepper across the top).

1. **Upload** — drag/drop or browse a PDF/PNG/JPG/TIFF; PDF page 1 is rendered
   to a thumbnail via `pdfjs-dist`. Or use the bundled example plan.
2. **Extract** — a staged simulation (`runExtraction()`) ticks through reading,
   locating the Nutzungsschablone, extracting constraints, geocoding, building.
3. **Review** — human-in-the-loop. Left: the plan image with clickable source
   regions. Right: an editable constraint sheet with AI-confidence chips. The
   "Confirm all" button is gated until every low-confidence value is resolved.
4. **3D & Compliance** — left: the MapLibre 3D map (proposed building in red,
   existing city in grey); right: a live compliance report with the Plan-Stempel
   verdict stamp. Edit any proposed value to re-check and re-render instantly.
   "Export report" prints a clean report (browser print, no PDF library).

## Architecture (where to plug the backend in)

- **`src/data/runExtraction.ts`** — THE data seam. Today it resolves bundled mock
  JSON after a timed simulation. The backend replaces only this function's body;
  the `ExtractionResult` shape (`src/types.ts`) is the contract. No `fetch()` is
  scattered through components.
- **`src/data/mockExtraction.ts`** — the demo plan (Bühl "Obere Au"). One
  deliberate FAIL is seeded (proposed height 11.4 m vs allowed 9.0 m).
- **`src/state/PlanContext.tsx`** — shared state: extraction result → reviewed
  constraints → proposed "what-if" values. The viewer and compliance panel both
  subscribe here, so edits propagate live.
- **`src/data/compliance.ts`** — pure compliance engine (no React).
- **`src/viewer/`** — `Viewer3D` defaults to **MapLibre** (`fill-extrusion`,
  key-free OpenFreeMap basemap) and auto-falls back to a hand-drawn isometric
  **schematic placeholder** if WebGL/tiles are unavailable. A toggle switches
  them. Both honour the single `Viewer3DProps` interface.

## City backdrop (LoD2 GML → GeoJSON)

The existing-buildings backdrop is **preloaded scenery**, not user input. Convert
one CityGML tile offline:

```bash
node scripts/gml-to-geojson.mjs path/to/LoD2_32_4xx_53xx_1_BW.gml
# → public/data/city.geojson  (fetched at startup, passed as cityBuildings)
# crop a large tile:  ... --bbox 8.12,48.69,8.15,48.70
```

If `public/data/city.geojson` is absent, the viewer renders without the backdrop
— never a crash.

## Coordinates

Source data is **EPSG:25832 (UTM 32N)**. Reprojection to EPSG:4326 happens at the
data layer (`proj4`), never inside components.

## Design — "Vermessungsamt, 2026"

Surveyor's linework and plan-paper, modernised. Tokens in `src/index.css`
(`@theme`): `plan-paper`, `ink`, `survey-teal`, `parcel-red` (the only loud
colour — proposed building / FAIL), `seal-amber`, `grid-line`. Archivo for
titles, Inter for UI, IBM Plex Mono for every measurement. Zero border-radius,
1px ink borders, faint drafting grid. The Plan-Stempel verdict stamp is the one
theatrical flourish.

## Tech

Vite · React · TypeScript · Tailwind CSS v4 (no component library) · MapLibre GL
· pdfjs-dist · proj4. Single-page, mock-first.
