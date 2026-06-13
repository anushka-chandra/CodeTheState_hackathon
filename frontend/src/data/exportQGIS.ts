import type { Polygon } from 'geojson'
import type { ExtractionResult, PlanZone, Constraint } from '../types'
import { buildProposedFeatures } from '../viewer/buildingGeometry'
import { roofTypeFromLabel } from './roof'
import { toEPSG25832 } from './useCityBuildings'

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
  baseElevationM = 0,
  rotationDeg = 0,
) {
  const zones = result.zones ?? [{ id: 'zone-1', name: 'Plangebiet', constraints: result.constraints, footprint: result.footprint }]

  const allFeatures: GeoJSON.Feature[] = []

  for (const zone of zones) {
    const heightM = toNum(getConstraintValue(zone.constraints, 'max_height') ?? proposed['max_height'], 9)
    const roofLabel = String(getConstraintValue(zone.constraints, 'roof_type') ?? proposed['roof_type'] ?? 'unknown')
    const roofType = roofTypeFromLabel(roofLabel)
    const pitchDeg = toNum(getConstraintValue(zone.constraints, 'roof_pitch') ?? proposed['roof_pitch'], 35)
    const footprint = zone.footprint ?? activeFootprint

    const fc = buildProposedFeatures(footprint, heightM, roofType, pitchDeg, true, rotationDeg)

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
          base_elevation: baseElevationM,
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
 * Export as OGC Simple Features GML 3.2 in EPSG:25832 — matches LGL LOD2 tiles.
 * Produces a gml:FeatureCollection with one Building featureMember per zone,
 * each carrying a gml:MultiSurface (ground + walls + roof) and flat attributes.
 * Coordinates are easting/northing/NHN so the building sits at the correct
 * absolute elevation next to official LOD2 data.
 */
export function exportCityGML(
  result: ExtractionResult,
  proposed: Record<string, string | number>,
  activeFootprint: Polygon,
  baseElevationM = 0,
  rotationDeg = 0,
) {
  const zones = result.zones ?? [{ id: 'zone-1', name: 'Plangebiet', constraints: result.constraints, footprint: result.footprint }]

  let envMinE = Infinity, envMaxE = -Infinity
  let envMinN = Infinity, envMaxN = -Infinity
  let envMinZ = Infinity, envMaxZ = -Infinity
  const members: string[] = []

  for (const zone of zones) {
    const member = buildCityGMLBuilding(zone, result, proposed, activeFootprint, baseElevationM, rotationDeg)
    if (!member) continue
    members.push(member.xml)
    if (member.minE < envMinE) envMinE = member.minE
    if (member.maxE > envMaxE) envMaxE = member.maxE
    if (member.minN < envMinN) envMinN = member.minN
    if (member.maxN > envMaxN) envMaxN = member.maxN
    if (member.minZ < envMinZ) envMinZ = member.minZ
    if (member.maxZ > envMaxZ) envMaxZ = member.maxZ
  }

  const CRS = 'urn:ogc:def:crs:EPSG::25832'

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gml:FeatureCollection
    xmlns:gml="http://www.opengis.net/gml/3.2"
    xmlns:pr="http://planraum.ai/schema"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <gml:boundedBy>
    <gml:Envelope srsName="${CRS}" srsDimension="3">
      <gml:lowerCorner>${envMinE.toFixed(2)} ${envMinN.toFixed(2)} ${envMinZ.toFixed(2)}</gml:lowerCorner>
      <gml:upperCorner>${envMaxE.toFixed(2)} ${envMaxN.toFixed(2)} ${envMaxZ.toFixed(2)}</gml:upperCorner>
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
  baseElev: number,
  rotationDeg: number,
): { xml: string; minE: number; maxE: number; minN: number; maxN: number; minZ: number; maxZ: number } | null {
  const heightM = toNum(getConstraintValue(zone.constraints, 'max_height') ?? proposed['max_height'], 9)
  const roofLabel = String(getConstraintValue(zone.constraints, 'roof_type') ?? proposed['roof_type'] ?? 'unknown')
  const roofType = roofTypeFromLabel(roofLabel)
  const pitchDeg = toNum(getConstraintValue(zone.constraints, 'roof_pitch') ?? proposed['roof_pitch'], 35)
  const footprint = zone.footprint ?? activeFootprint

  // Build the full 3D geometry (with rotation) using the same code as the viewer.
  const fc = buildProposedFeatures(footprint, heightM, roofType, pitchDeg, true, rotationDeg)
  if (fc.features.length === 0) return null

  const CRS = 'urn:ogc:def:crs:EPSG::25832'

  // Convert all polygon features to EPSG:25832 surface members with absolute Z.
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity
  const groundZ = baseElev
  const roofZ = baseElev + heightM

  const polygons: string[] = []
  for (const f of fc.features) {
    if (f.geometry.type !== 'Polygon') continue
    for (const ring of f.geometry.coordinates) {
      const relBase = (f.properties as { base?: number })?.base ?? 0
      const relHeight = (f.properties as { height?: number })?.height ?? heightM
      // Each vertex: convert lon/lat to 25832, add absolute Z
      const posEntries: string[] = []
      for (const [lon, lat] of ring) {
        const [e, n] = toEPSG25832(lon, lat)
        if (e < minE) minE = e; if (e > maxE) maxE = e
        if (n < minN) minN = n; if (n > maxN) maxN = n
        // Interpolate Z: the viewer stores relative base/height per feature.
        // For ground faces base=0/height=0, walls base=0/height=eave, roof base=eave/height=ridge.
        // All vertices in a polygon ring share the same base or height level,
        // but the ring is at a single Z level for ground/roof. For wall quads,
        // vertices alternate between base and height Z. Since buildProposedFeatures
        // produces flat extrusion polygons (MapLibre renders the extrusion between
        // base and height), the polygon ring itself is at Z=0 in lon/lat.
        // We use the feature's height property as the top Z.
        // For the GML export we need actual 3D coordinates, so we place the
        // polygon at the midpoint of base..height (the footprint outline).
        posEntries.push(`${e.toFixed(2)} ${n.toFixed(2)}`)
      }
      // Determine the Z for this surface from the feature properties.
      const absBase = baseElev + relBase
      const absTop = baseElev + relHeight
      const part = (f.properties as { part?: string })?.part
      if (part === 'wall') {
        // Wall quad: 4 vertices at alternating Z (ground, ground, eave, eave, ground)
        // Rebuild with proper per-vertex Z.
        const wallPos: string[] = []
        for (let vi = 0; vi < ring.length; vi++) {
          const [lon, lat] = ring[vi]
          const [e, n] = toEPSG25832(lon, lat)
          // First two and last vertex at base, middle two at top
          const z = vi === 2 || vi === 3 ? absTop : absBase
          wallPos.push(`${e.toFixed(2)} ${n.toFixed(2)} ${z.toFixed(2)}`)
        }
        polygons.push(gmlPolygon(wallPos.join(' '), CRS))
      } else {
        // Ground or roof: all vertices at a single Z level.
        const z = part === 'roof' ? absTop : absBase
        const posWithZ = posEntries.map((en) => `${en} ${z.toFixed(2)}`).join(' ')
        polygons.push(gmlPolygon(posWithZ, CRS))
      }
    }
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

  return { xml, minE, maxE, minN, maxN, minZ: groundZ, maxZ: roofZ }
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
  baseElevationM = 0,
  rotationDeg = 0,
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

    // Build rotated 3D geometry using the same code as the viewer and CityGML export.
    const fc = buildProposedFeatures(footprint, heightM, roofType, pitchDeg, true, rotationDeg)
    if (fc.features.length === 0) continue

    // Collect all lon/lat for extent.
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity

    const surfaces: number[][][] = []
    const semantics: { type: string }[] = []
    const semanticValues: number[] = []

    // Semantic indices — one entry per type.
    const semGround = 0; semantics.push({ type: 'GroundSurface' })
    const semRoof = 1; semantics.push({ type: 'RoofSurface' })
    const semWall = 2; semantics.push({ type: 'WallSurface' })

    for (const f of fc.features) {
      if (f.geometry.type !== 'Polygon') continue
      const props = f.properties as { part?: string; base?: number; height?: number }
      const relBase = props.base ?? 0
      const relHeight = props.height ?? heightM
      const part = props.part

      for (const ring of f.geometry.coordinates) {
        const n = ring.length
        if (n < 4) continue

        if (part === 'wall') {
          // Wall quad: vertices alternate between base Z and top Z.
          // buildProposedFeatures makes 5-vertex closed quads:
          // [bl, br, tr, tl, bl] where first 2 & last are at base, middle 2 at top.
          const boundary: number[] = []
          for (let vi = 0; vi < n - 1; vi++) {
            const [lon, lat] = ring[vi]
            if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon
            if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat
            const z = vi === 2 || vi === 3
              ? baseElevationM + relHeight
              : baseElevationM + relBase
            boundary.push(addVertex(lon, lat, z))
          }
          surfaces.push([boundary])
          semanticValues.push(semWall)
        } else {
          // Ground or roof: all vertices at a single Z level.
          const z = part === 'roof'
            ? baseElevationM + relHeight
            : baseElevationM + relBase
          const boundary: number[] = []
          for (let vi = 0; vi < n - 1; vi++) {
            const [lon, lat] = ring[vi]
            if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon
            if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat
            boundary.push(addVertex(lon, lat, z))
          }
          surfaces.push([boundary])
          semanticValues.push(part === 'roof' ? semRoof : semGround)
        }
      }
    }

    const floors = Math.round(toNum(getConstraintValue(zone.constraints, 'floors'), 2))

    cityObjects[zone.id] = {
      type: 'Building',
      attributes: {
        measuredHeight: heightM,
        roofType: roofLabel,
        storeysAboveGround: floors,
        planName: result.plan.name,
        municipality: result.plan.municipality,
      },
      geographicalExtent: [minLon, minLat, baseElevationM, maxLon, maxLat, baseElevationM + heightM],
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
