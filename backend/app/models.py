"""Pydantic models that mirror the frontend's data contract (frontend/src/types.ts).

Field names are intentionally camelCase to match the JSON the React app already
consumes — keep these in lockstep with `ExtractionResult` / `Constraint` on the
frontend. Changing a key here is a breaking API change.
"""

from typing import List, Literal, Optional, Union

from pydantic import BaseModel

ConstraintKey = Literal[
    "max_height",
    "roof_type",
    "roof_pitch",
    "grz",
    "gfz",
    "floors",
    "bauweise",
    "bezugspunkt",
]

Confidence = Literal["high", "medium", "low"]


class SourceBox(BaseModel):
    """Normalised (0-1) bounding box of the value's source region on the page."""

    page: int
    x: float
    y: float
    w: float
    h: float


class Constraint(BaseModel):
    key: ConstraintKey
    labelDe: str  # noqa: N815 - matches frontend JSON contract
    labelEn: str  # noqa: N815
    value: Union[str, float]
    unit: Optional[Literal["m", "°", ""]] = ""
    confidence: Confidence
    sourceBox: Optional[SourceBox] = None  # noqa: N815


class Centroid(BaseModel):
    lon: float
    lat: float


class PlanMeta(BaseModel):
    name: str
    planNumber: Optional[str] = None  # noqa: N815
    municipality: str
    crs: Literal["EPSG:25832"]
    centroidWGS84: Centroid  # noqa: N815


class Polygon(BaseModel):
    """A GeoJSON Polygon (EPSG:4326 after reprojection)."""

    type: Literal["Polygon"] = "Polygon"
    coordinates: List[List[List[float]]]


class PlanZone(BaseModel):
    id: str
    name: str
    constraints: List[Constraint]
    footprint: Optional[Polygon] = None


class ExtractionResult(BaseModel):
    plan: PlanMeta
    constraints: List[Constraint]
    footprint: Polygon
    zones: Optional[List[PlanZone]] = None
    sourcePage: Optional[int] = None  # noqa: N815
