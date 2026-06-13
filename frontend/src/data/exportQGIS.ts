import type { Polygon } from 'geojson'
import type { ExtractionResult, PlanZone, Constraint } from '../types'
import { buildProposedFeatures } from '../viewer/buildingGeometry'
import { roofTypeFromLabel } from './roof'

/** Trigger a browser download of a string as a file. */
function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function getConstraintValue(constraints: Constraint[], key: string): string | number | undefined {
  return constraints.find((c) => c.key === key)?.value
}

function toNum(v: string | number | undefined, fallback: number): number {
  if (v == null) return fallback
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}

/**
 * Export the proposed building(s) as a 3D GeoJSON FeatureCollection.
 * Each zone produces wall + roof features with full metadata.
 * Directly importable into QGIS as a vector layer with 3D renderer.
 */
export function exportGeoJSON(
  result: ExtractionResult,
  proposed: Record<string, string | number>,
  activeFootprint: Polygon,
) {
  const zones = result.zones ?? [{ id: 'zone-1', name: 'Plangebiet', constraints: result.constraints, footprint: result.footprint }]

  const allFeatures: GeoJSON.Feature[] = []

  for (const zone of zones) {
    const heightM = toNum(getConstraintValue(zone.constraints, 'max_height') ?? proposed['max_height'], 9)
    const roofLabel = String(getConstraintValue(zone.constraints, 'roof_type') ?? proposed['roof_type'] ?? 'unknown')
    const roofType = roofTypeFromLabel(roofLabel)
    const pitchDeg = toNum(getConstraintValue(zone.constraints, 'roof_pitch') ?? proposed['roof_pitch'], 35)
    const footprint = zone.footprint ?? activeFootprint

    const fc = buildProposedFeatures(footprint, heightM, roofType, pitchDeg, true)

    for (const f of fc.features) {
      allFeatures.push({
        ...f,
        properties: {
          ...f.properties,
          zone_id: zone.id,
          zone_name: zone.name,
          plan_name: result.plan.name,
          plan_number: result.plan.planNumber ?? '',
          municipality: result.plan.municipality,
          crs: result.plan.crs,
          roof_type: roofLabel,
          roof_pitch: pitchDeg,
          max_height: heightM,
          grz: toNum(getConstraintValue(zone.constraints, 'grz'), 0),
          gfz: toNum(getConstraintValue(zone.constraints, 'gfz'), 0),
          floors: toNum(getConstraintValue(zone.constraints, 'floors'), 0),
        },
      })
    }
  }

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: allFeatures,
  }

  const filename = `${result.plan.name || 'planraum'}_3d.geojson`.replace(/\s+/g, '_')
  download(JSON.stringify(geojson, null, 2), filename, 'application/geo+json')
}

/**
 * Export as OGC Simple Features GML 3.2 — GDAL/OGR reads geometry correctly.
 * Produces a gml:FeatureCollection with one Building featureMember per zone,
 * each carrying a gml:MultiSurface (ground + walls + roof) and flat attributes.
 * Uses CRS84 (lon,lat order) to avoid OGR's EPSG:4326 axis swap.
 */
export function exportCityGML(
  result: ExtractionResult,
  proposed: Record<string, string | number>,
  activeFootprint: Polygon,
) {
  const zones = result.zones ?? [{ id: 'zone-1', name: 'Plangebiet', constraints: result.constraints, footprint: result.footprint }]

  // Compute overall bounding box for the envelope.
  let envMinLon = Infinity, envMaxLon = -Infinity
  let envMinLat = Infinity, envMaxLat = -Infinity
  let envMaxZ = 0
  const members: string[] = []

  for (const zone of zones) {
    const member = buildCityGMLBuilding(zone, result, proposed, activeFootprint)
    if (!member) continue
    members.push(member.xml)
    if (member.minLon < envMinLon) envMinLon = member.minLon
    if (member.maxLon > envMaxLon) envMaxLon = member.maxLon
    if (member.minLat < envMinLat) envMinLat = member.minLat
    if (member.maxLat > envMaxLat) envMaxLat = member.maxLat
    if (member.maxZ > envMaxZ) envMaxZ = member.maxZ
  }

  const CRS = 'urn:ogc:def:crs:OGC:1.3:CRS84'

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gml:FeatureCollection
    xmlns:gml="http://www.opengis.net/gml/3.2"
    xmlns:pr="http://planraum.ai/schema"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <gml:boundedBy>
    <gml:Envelope srsName="${CRS}" srsDimension="3">
      <gml:lowerCorner>${envMinLon} ${envMinLat} 0</gml:lowerCorner>
      <gml:upperCorner>${envMaxLon} ${envMaxLat} ${envMaxZ.toFixed(2)}</gml:upperCorner>
    </gml:Envelope>
  </gml:boundedBy>
${members.join('\n')}
</gml:FeatureCollection>`

  const filename = `${result.plan.name || 'planraum'}_LOD2.gml`.replace(/\s+/g, '_')
  download(xml, filename, 'application/gml+xml')
}

function buildCityGMLBuilding(
  zone: PlanZone,
  result: ExtractionResult,
  proposed: Record<string, string | number>,
  activeFootprint: Polygon,
): { xml: string; minLon: number; maxLon: number; minLat: number; maxLat: number; maxZ: number } | null {
  const heightM = toNum(getConstraintValue(zone.constraints, 'max_height') ?? proposed['max_height'], 9)
  const roofLabel = String(getConstraintValue(zone.constraints, 'roof_type') ?? proposed['roof_type'] ?? 'unknown')
  const roofType = roofTypeFromLabel(roofLabel)
  const pitchDeg = toNum(getConstraintValue(zone.constraints, 'roof_pitch') ?? proposed['roof_pitch'], 35)
  const footprint = zone.footprint ?? activeFootprint
  const ring = footprint.coordinates[0]
  if (!ring || ring.length < 4) return null

  const lons = ring.map((c) => c[0])
  const lats = ring.map((c) => c[1])
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const centerLat = (minLat + maxLat) / 2
  const mPerDegLon = 111320 * Math.cos((centerLat * Math.PI) / 180)
  const mPerDegLat = 110540
  const widthM = (maxLon - minLon) * mPerDegLon
  const heightDegM = (maxLat - minLat) * mPerDegLat
  const spanM = Math.min(widthM, heightDegM)
  const pitchRad = (pitchDeg * Math.PI) / 180
  const roofRise = Math.min((spanM / 2) * Math.tan(pitchRad), heightM * 0.6)
  const eaveH = roofType === 'flach' || roofType === 'unknown' ? heightM : Math.max(heightM - roofRise, heightM * 0.4)

  const CRS = 'urn:ogc:def:crs:OGC:1.3:CRS84'

  // Build individual polygon strings for all surfaces.
  const polygons: string[] = []

  // Ground polygon at z=0.
  const groundPos = ring.map((c) => `${c[0]} ${c[1]} 0`).join(' ')
  polygons.push(gmlPolygon(groundPos, CRS))

  // Roof polygon at z=heightM.
  const roofPos = ring.map((c) => `${c[0]} ${c[1]} ${heightM.toFixed(2)}`).join(' ')
  polygons.push(gmlPolygon(roofPos, CRS))

  // Wall quads: one per edge, ground to eave.
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[i + 1]
    const wallPos = `${x1} ${y1} 0 ${x2} ${y2} 0 ${x2} ${y2} ${eaveH.toFixed(2)} ${x1} ${y1} ${eaveH.toFixed(2)} ${x1} ${y1} 0`
    polygons.push(gmlPolygon(wallPos, CRS))
  }

  const surfaceMembers = polygons.map((p) => `          <gml:surfaceMember>\n${p}\n          </gml:surfaceMember>`).join('\n')

  const grz = toNum(getConstraintValue(zone.constraints, 'grz'), 0)
  const gfz = toNum(getConstraintValue(zone.constraints, 'gfz'), 0)
  const floors = Math.round(toNum(getConstraintValue(zone.constraints, 'floors'), 2))

  const xml = `  <gml:featureMember>
    <pr:Building gml:id="${escapeXml(zone.id)}">
      <pr:geometry>
        <gml:MultiSurface srsName="${CRS}" srsDimension="3">
${surfaceMembers}
        </gml:MultiSurface>
      </pr:geometry>
      <pr:name>${escapeXml(zone.name)}</pr:name>
      <pr:zone_id>${escapeXml(zone.id)}</pr:zone_id>
      <pr:measuredHeight>${heightM.toFixed(1)}</pr:measuredHeight>
      <pr:storeysAboveGround>${floors}</pr:storeysAboveGround>
      <pr:roofType>${escapeXml(roofLabel)}</pr:roofType>
      <pr:grz>${grz}</pr:grz>
      <pr:gfz>${gfz}</pr:gfz>
      <pr:floors>${floors}</pr:floors>
      <pr:plan_name>${escapeXml(result.plan.name)}</pr:plan_name>
      <pr:plan_number>${escapeXml(result.plan.planNumber ?? '')}</pr:plan_number>
      <pr:municipality>${escapeXml(result.plan.municipality)}</pr:municipality>
    </pr:Building>
  </gml:featureMember>`

  return { xml, minLon, maxLon, minLat, maxLat, maxZ: heightM }
}

function gmlPolygon(posList: string, crs: string): string {
  return `            <gml:Polygon srsName="${crs}" srsDimension="3">
              <gml:exterior>
                <gml:LinearRing>
                  <gml:posList srsDimension="3">${posList}</gml:posList>
                </gml:LinearRing>
              </gml:exterior>
            </gml:Polygon>`
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Export as CityJSON 2.0 — reliable QGIS import with full 3D geometry.
 * Generates a single Building CityObject with Ground, Wall, and Roof surfaces.
 */
export function exportCityJSON(
  result: ExtractionResult,
  proposed: Record<string, string | number>,
  activeFootprint: Polygon,
) {
  const zones = result.zones ?? [{ id: 'zone-1', name: 'Plangebiet', constraints: result.constraints, footprint: result.footprint }]

  const vertices: [number, number, number][] = []
  const vertexIndex = new Map<string, number>()
  const cityObjects: Record<string, CityJSONBuilding> = {}

  function addVertex(x: number, y: number, z: number): number {
    const key = `${x.toFixed(8)},${y.toFixed(8)},${z.toFixed(3)}`
    const existing = vertexIndex.get(key)
    if (existing != null) return existing
    const idx = vertices.length
    vertices.push([x, y, z])
    vertexIndex.set(key, idx)
    return idx
  }

  for (const zone of zones) {
    const heightM = toNum(getConstraintValue(zone.constraints, 'max_height') ?? proposed['max_height'], 9)
    const roofLabel = String(getConstraintValue(zone.constraints, 'roof_type') ?? proposed['roof_type'] ?? 'unknown')
    const roofType = roofTypeFromLabel(roofLabel)
    const pitchDeg = toNum(getConstraintValue(zone.constraints, 'roof_pitch') ?? proposed['roof_pitch'], 35)
    const footprint = zone.footprint ?? activeFootprint
    const ring = footprint.coordinates[0]
    if (!ring || ring.length < 4) continue

    // Compute eave height (same logic as CityGML and viewer)
    const lons = ring.map((c) => c[0])
    const lats = ring.map((c) => c[1])
    const minLon = Math.min(...lons), maxLon = Math.max(...lons)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const centerLat = (minLat + maxLat) / 2
    const mPerDegLon = 111320 * Math.cos((centerLat * Math.PI) / 180)
    const mPerDegLat = 110540
    const widthM = (maxLon - minLon) * mPerDegLon
    const heightDegM = (maxLat - minLat) * mPerDegLat
    const spanM = Math.min(widthM, heightDegM)
    const pitchRad = (pitchDeg * Math.PI) / 180
    const roofRise = Math.min((spanM / 2) * Math.tan(pitchRad), heightM * 0.6)
    const eaveH = roofType === 'flach' || roofType === 'unknown' ? heightM : Math.max(heightM - roofRise, heightM * 0.4)

    // Boundary indices for ground ring (closed, exclude last duplicate)
    const n = ring.length - 1

    // Ground surface: ring at z=0
    const groundBoundary = ring.slice(0, n).map(([x, y]) => addVertex(x, y, 0))

    // Roof surface: ring at z=heightM
    const roofBoundary = ring.slice(0, n).map(([x, y]) => addVertex(x, y, heightM))

    // Wall surfaces: one quad per edge, ground to eave
    const wallBoundaries: number[][] = []
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      wallBoundaries.push([
        addVertex(ring[i][0], ring[i][1], 0),
        addVertex(ring[j][0], ring[j][1], 0),
        addVertex(ring[j][0], ring[j][1], eaveH),
        addVertex(ring[i][0], ring[i][1], eaveH),
      ])
    }

    const surfaces: number[][][] = []
    const semantics: { type: string }[] = []
    const semanticValues: number[] = []

    // Ground
    surfaces.push([groundBoundary])
    semantics.push({ type: 'GroundSurface' })
    semanticValues.push(0)

    // Roof
    surfaces.push([roofBoundary])
    semantics.push({ type: 'RoofSurface' })
    semanticValues.push(1)

    // Walls
    const wallSemanticIdx = semantics.length
    semantics.push({ type: 'WallSurface' })
    for (const wb of wallBoundaries) {
      surfaces.push([wb])
      semanticValues.push(wallSemanticIdx)
    }

    cityObjects[zone.id] = {
      type: 'Building',
      attributes: {
        measuredHeight: heightM,
        roofType: roofLabel,
        storeysAboveGround: Math.round(toNum(getConstraintValue(zone.constraints, 'floors'), 2)),
        planName: result.plan.name,
        municipality: result.plan.municipality,
      },
      geographicalExtent: [minLon, minLat, 0, maxLon, maxLat, heightM],
      geometry: [{
        type: 'Solid',
        lod: '2',
        boundaries: [surfaces],
        semantics: {
          surfaces: semantics,
          values: [semanticValues],
        },
      }],
    }
  }

  const cityjson = {
    type: 'CityJSON',
    version: '2.0',
    metadata: {
      referenceSystem: 'https://www.opengis.net/def/crs/EPSG/0/4326',
      title: result.plan.name,
      identifier: result.plan.planNumber ?? '',
    },
    CityObjects: cityObjects,
    vertices,
  }

  const filename = `${result.plan.name || 'planraum'}_3d.city.json`.replace(/\s+/g, '_')
  download(JSON.stringify(cityjson, null, 2), filename, 'application/city+json')
}

interface CityJSONBuilding {
  type: string
  attributes: Record<string, unknown>
  geographicalExtent: number[]
  geometry: {
    type: string
    lod: string
    boundaries: number[][][][]
    semantics: {
      surfaces: { type: string }[]
      values: number[][]
    }
  }[]
}
