"""Vision-model extraction service.

Receives base64 page images, sends them to an OpenAI-compatible vision model,
parses the structured JSON response, and returns a normalised ExtractionResult.

This is a Python port of the logic in api/extract.ts — same prompt, same
normalisation, same contract.
"""

import json
import logging
import math
import os
import re
from typing import Any, Optional

import httpx

from openai import AsyncOpenAI

from app.models import (
    Centroid,
    Confidence,
    Constraint,
    ConstraintKey,
    ExtractionResult,
    PlanMeta,
    PlanZone,
    Polygon,
)

DEFAULT_CENTER = Centroid(lon=8.135, lat=48.695)
MAX_PAGES = 3

ALLOWED_KEYS: list[str] = [
    "max_height", "roof_type", "roof_pitch", "grz", "gfz",
    "floors", "bauweise", "bezugspunkt",
]

NUMERIC_KEYS = {"max_height", "grz", "gfz"}

DE_LABELS: dict[str, str] = {
    "max_height": "Firsthöhe (FH)",
    "roof_type": "Dachform",
    "roof_pitch": "Dachneigung (DN)",
    "grz": "Grundflächenzahl (GRZ)",
    "gfz": "Geschossflächenzahl (GFZ)",
    "floors": "Zahl der Vollgeschosse",
    "bauweise": "Bauweise",
    "bezugspunkt": "Bezugspunkt",
}
EN_LABELS: dict[str, str] = {
    "max_height": "Max ridge height",
    "roof_type": "Roof type",
    "roof_pitch": "Roof pitch",
    "grz": "Lot coverage ratio (GRZ)",
    "gfz": "Floor-area ratio (GFZ)",
    "floors": "Number of full storeys",
    "bauweise": "Building method",
    "bezugspunkt": "Height reference point",
}

SCHEMA_HINT = """{
  "plan": {
    "name": string,
    "planNumber": string|null,
    "municipality": string
  },
  "zones": [
    {
      "id": string,
      "name": string,
      "constraints": [
        {
          "key": "max_height"|"roof_type"|"roof_pitch"|"grz"|"gfz"|"floors"|"bauweise"|"bezugspunkt",
          "labelDe": string,
          "labelEn": string,
          "value": string|number,
          "unit": "m"|"°"|"",
          "confidence": "high"|"medium"|"low"
        }
      ]
    }
  ]
}"""

PROMPT = f"""You are reading a German Bebauungsplan (municipal zoning plan). Extract the binding building constraints:
- Firsthöhe / Gebäudehöhe (max height) -> key "max_height", unit "m"
- Dachform (roof type) -> key "roof_type"
- Dachneigung (roof pitch) -> key "roof_pitch", unit "°"
- GRZ (Grundflächenzahl) -> key "grz"
- GFZ (Geschossflächenzahl) -> key "gfz"
- Vollgeschosse (number of full storeys) -> key "floors"
- Bauweise (open/closed building method) -> key "bauweise"
- Bezugspunkt (height reference point) -> key "bezugspunkt" (only if explicitly stated)

If the plan has multiple zones / Nutzungsschablonen (e.g. WA 1, WA 2), return EACH zone separately with its own values in the "zones" array.

Respond ONLY with a single JSON object matching this schema (no prose, no markdown fences):
{SCHEMA_HINT}

Rules:
- The "key" field MUST be exactly one of these tokens: max_height, roof_type, roof_pitch, grz, gfz, floors, bauweise, bezugspunkt. Never put the German word in "key" — that belongs in "labelDe".
- Use honest confidence: "high" only if the value is clearly printed; "medium" if legible but ambiguous; "low" if inferred/guessed.
- Omit a constraint entirely if it is not present in the plan (do not invent values).
- Keep numeric values as numbers (e.g. 9.0, not "9,0 m"). Roof pitch ranges may stay as a string like "30-45".
- Always include at least one zone."""


def _coerce_key(*candidates: Any) -> Optional[str]:
    """Map any string the model used to a valid ConstraintKey."""
    for c in candidates:
        s = str(c or "").strip().lower()
        if not s:
            continue
        if s in ALLOWED_KEYS:
            return s
        if re.search(r"first|gebäudeh|geb\.h|max.?height|höhe|trauf", s):
            return "max_height"
        if re.search(r"dachform|roof.?type", s):
            return "roof_type"
        if re.search(r"dachneig|pitch|neigung", s):
            return "roof_pitch"
        if re.search(r"\bgrz\b|grundfläch|lot.?coverage", s):
            return "grz"
        if re.search(r"\bgfz\b|geschossfläch|floor.?area", s):
            return "gfz"
        if re.search(r"vollgeschoss|geschoss|storey|stories|floors", s):
            return "floors"
        if re.search(r"bauweise|building.?method", s):
            return "bauweise"
        if re.search(r"bezugspunkt|reference.?point", s):
            return "bezugspunkt"
    return None


def _pick_label(raw: Any, fallback: str) -> str:
    s = str(raw or "").strip()
    if not s:
        return fallback
    if s.lower() in ALLOWED_KEYS:
        return fallback
    return s


def _to_confidence(v: Any) -> Confidence:
    return v if v in ("high", "low") else "medium"


def _to_unit(v: Any) -> str:
    return v if v in ("m", "°") else ""


def _normalise_value(key: str, raw: Any) -> float | str:
    if isinstance(raw, (int, float)):
        return float(raw)
    s = str(raw or "").strip()
    if key in NUMERIC_KEYS:
        cleaned = re.sub(r"[^\d.\-]", "", s.replace(",", "."))
        try:
            return float(cleaned)
        except ValueError:
            pass
    return s


def _normalise_constraint(raw: dict[str, Any]) -> Optional[Constraint]:
    key = _coerce_key(raw.get("key"), raw.get("labelEn"), raw.get("labelDe"))
    if not key:
        return None
    val = raw.get("value")
    if val is None or str(val).strip() == "":
        return None
    return Constraint(
        key=key,  # type: ignore[arg-type]
        labelDe=_pick_label(raw.get("labelDe"), DE_LABELS.get(key, key)),
        labelEn=_pick_label(raw.get("labelEn"), EN_LABELS.get(key, key)),
        value=_normalise_value(key, val),
        unit=_to_unit(raw.get("unit")),
        confidence=_to_confidence(raw.get("confidence")),
    )


async def _geocode(query: str) -> Optional[Centroid]:
    """Geocode a free-text place to lon/lat via OSM Nominatim."""
    url = (
        "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q="
        + query
    )
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                url,
                headers={"User-Agent": "PLANRAUM/0.1 (IPAI Builder Day hackathon)"},
                timeout=5,
            )
            if r.status_code != 200:
                return None
            data = r.json()
            if isinstance(data, list) and data and data[0].get("lat") and data[0].get("lon"):
                lat = float(data[0]["lat"])
                lon = float(data[0]["lon"])
                if math.isfinite(lat) and math.isfinite(lon):
                    return Centroid(lon=lon, lat=lat)
    except Exception:
        pass
    return None


async def _resolve_center(raw: dict[str, Any]) -> Optional[Centroid]:
    """Best-effort centre for a plan from its name + municipality."""
    plan_raw = raw.get("plan") or {}
    muni = str(plan_raw.get("municipality") or "").strip()
    raw_name = str(plan_raw.get("name") or "")
    place = re.sub(
        r"bebauungsplan|örtliche|bauvorschriften|und|[\"'„\u201c\u201d»«]",
        " ",
        raw_name,
        flags=re.IGNORECASE,
    )
    place = re.sub(r"\s+", " ", place).strip()

    tries = []
    if place and muni:
        tries.append(f"{place}, {muni}, Germany")
    if muni:
        tries.append(f"{muni}, Germany")

    for q in tries:
        hit = await _geocode(q)
        if hit:
            return hit
    return None


def _default_footprint(center: Centroid) -> Polygon:
    hw, hh = 0.000136, 0.0000629
    return Polygon(coordinates=[[
        [center.lon - hw, center.lat - hh],
        [center.lon + hw, center.lat - hh],
        [center.lon + hw, center.lat + hh],
        [center.lon - hw, center.lat + hh],
        [center.lon - hw, center.lat - hh],
    ]])


def _strip_fences(text: str) -> str:
    t = text.strip()
    # Strip Qwen-style <think>…</think> blocks.
    t = re.sub(r"<think>[\s\S]*?</think>", "", t, flags=re.IGNORECASE).strip()
    # Strip markdown code fences.
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", t, re.IGNORECASE)
    if m:
        t = m.group(1).strip()
    if not t.startswith("{"):
        start = t.find("{")
        end = t.rfind("}")
        if start != -1 and end > start:
            t = t[start:end + 1]
    return t


def _normalise(
    raw: dict[str, Any],
    center_override: Optional[Centroid] = None,
) -> ExtractionResult:
    plan_raw = raw.get("plan") or {}

    if center_override:
        center = center_override
    else:
        centroid_raw = plan_raw.get("centroidWGS84")
        if centroid_raw and isinstance(centroid_raw.get("lon"), (int, float)) and isinstance(centroid_raw.get("lat"), (int, float)):
            center = Centroid(lon=centroid_raw["lon"], lat=centroid_raw["lat"])
        else:
            center = DEFAULT_CENTER

    footprint_raw = raw.get("footprint")
    footprint = Polygon(**footprint_raw) if footprint_raw and footprint_raw.get("coordinates") else _default_footprint(center)

    # Zones
    raw_zones: list[dict] = raw.get("zones") if isinstance(raw.get("zones"), list) else []
    if not raw_zones and isinstance(raw.get("constraints"), list):
        raw_zones = [{"id": "zone-1", "name": "Plangebiet", "constraints": raw["constraints"]}]

    zones: list[PlanZone] = []
    for i, z in enumerate(raw_zones):
        seen: set[str] = set()
        constraints: list[Constraint] = []
        for rc in (z.get("constraints") or []):
            c = _normalise_constraint(rc)
            if c and c.key not in seen:
                seen.add(c.key)
                constraints.append(c)
        if constraints:
            zone_footprint = None
            if z.get("footprint") and z["footprint"].get("coordinates"):
                zone_footprint = Polygon(**z["footprint"])
            zones.append(PlanZone(
                id=str(z.get("id") or f"zone-{i + 1}"),
                name=str(z.get("name") or f"Zone {i + 1}"),
                constraints=constraints,
                footprint=zone_footprint,
            ))

    if not zones:
        logging.warning("[EXTRACT] No constraints found in parsed response: %s", json.dumps(raw, default=str)[:500])
        raise ValueError("No constraints extracted — the document may not be a readable Bebauungsplan")

    return ExtractionResult(
        plan=PlanMeta(
            name=str(plan_raw.get("name") or "Bebauungsplan"),
            planNumber=str(plan_raw["planNumber"]) if plan_raw.get("planNumber") else None,
            municipality=str(plan_raw.get("municipality") or ""),
            crs="EPSG:25832",
            centroidWGS84=center,
        ),
        constraints=zones[0].constraints,
        footprint=zones[0].footprint or footprint,
        zones=zones,
        sourcePage=1,
    )


def _get_client() -> AsyncOpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set")
    base_url = (os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1").strip().strip("\"'").rstrip("/")
    return AsyncOpenAI(api_key=api_key, base_url=base_url)


async def run_extraction_from_images(images: list[str]) -> ExtractionResult:
    """Run vision extraction on base64 page images and return ExtractionResult."""
    client = _get_client()
    model = os.getenv("OPENAI_MODEL") or "stackit-qwen-qwen3-vl-235b-a22b-instruct-fp8"

    content: list[dict[str, Any]] = [{"type": "text", "text": PROMPT}]
    for url in images[:MAX_PAGES]:
        content.append({"type": "image_url", "image_url": {"url": url}})

    completion = await client.chat.completions.create(
        model=model,
        temperature=0.1,
        max_tokens=4000,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": content}],
    )

    raw_text = completion.choices[0].message.content or ""
    logging.info("[EXTRACT] Model response (%d chars): %s", len(raw_text), raw_text[:2000])

    cleaned = _strip_fences(raw_text)
    if not cleaned:
        raise ValueError("Model returned empty response — the PDF pages may be unreadable")

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logging.error("[EXTRACT] JSON parse failed: %s\nCleaned text: %s", e, cleaned[:1000])
        raise ValueError(f"Model response was not valid JSON: {e}") from e

    center = await _resolve_center(parsed)
    return _normalise(parsed, center)
