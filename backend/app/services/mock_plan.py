"""The bundled demo plan — Bühl "Obere Au".

Mirrors frontend/src/data/mockExtraction.ts so the API returns the exact same
contract the frontend already renders. The footprint is a small rectangle near
lon 8.135, lat 48.695 (already EPSG:4326). One value (GFZ) is deliberately
low-confidence to exercise the human-in-the-loop review screen.
"""

from app.models import (
    Centroid,
    Constraint,
    ExtractionResult,
    PlanMeta,
    Polygon,
    SourceBox,
)

_CENTER = Centroid(lon=8.135, lat=48.695)
_HALF_W = 0.000136  # ~10 m east-west at this latitude
_HALF_H = 0.0000629  # ~7 m north-south


def build_mock_plan() -> ExtractionResult:
    return ExtractionResult(
        plan=PlanMeta(
            name="Bebauungsplan 'Obere Au', Stadt Bühl",
            planNumber="B-PLAN 2024-07",
            municipality="Stadt Bühl",
            crs="EPSG:25832",
            centroidWGS84=_CENTER,
        ),
        sourcePage=1,
        constraints=[
            Constraint(
                key="max_height",
                labelDe="Firsthöhe (FH)",
                labelEn="Max ridge height",
                value=9.0,
                unit="m",
                confidence="high",
                sourceBox=SourceBox(page=1, x=0.6, y=0.297, w=0.32, h=0.051),
            ),
            Constraint(
                key="roof_type",
                labelDe="Dachform",
                labelEn="Roof type",
                value="Satteldach",
                unit="",
                confidence="high",
                sourceBox=SourceBox(page=1, x=0.6, y=0.376, w=0.32, h=0.051),
            ),
            Constraint(
                key="roof_pitch",
                labelDe="Dachneigung (DN)",
                labelEn="Roof pitch",
                value="30–45",
                unit="°",
                confidence="medium",
                sourceBox=SourceBox(page=1, x=0.6, y=0.452, w=0.32, h=0.051),
            ),
            Constraint(
                key="grz",
                labelDe="Grundflächenzahl (GRZ)",
                labelEn="Lot coverage ratio",
                value=0.4,
                unit="",
                confidence="high",
                sourceBox=SourceBox(page=1, x=0.12, y=0.704, w=0.3, h=0.04),
            ),
            Constraint(
                key="gfz",
                labelDe="Geschossflächenzahl (GFZ)",
                labelEn="Floor-area ratio",
                value=0.8,
                unit="",
                confidence="low",
                sourceBox=SourceBox(page=1, x=0.12, y=0.756, w=0.3, h=0.04),
            ),
            Constraint(
                key="floors",
                labelDe="Zahl der Vollgeschosse",
                labelEn="Number of full storeys",
                value="II",
                unit="",
                confidence="medium",
                sourceBox=SourceBox(page=1, x=0.12, y=0.809, w=0.3, h=0.04),
            ),
        ],
        footprint=Polygon(
            coordinates=[
                [
                    [_CENTER.lon - _HALF_W, _CENTER.lat - _HALF_H],
                    [_CENTER.lon + _HALF_W, _CENTER.lat - _HALF_H],
                    [_CENTER.lon + _HALF_W, _CENTER.lat + _HALF_H],
                    [_CENTER.lon - _HALF_W, _CENTER.lat + _HALF_H],
                    [_CENTER.lon - _HALF_W, _CENTER.lat - _HALF_H],
                ]
            ]
        ),
    )
