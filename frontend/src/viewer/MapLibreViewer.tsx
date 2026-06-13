import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl'
import type { Viewer3DProps } from './Viewer3D.types'
import { buildProposedFeatures } from './buildingGeometry'

interface MapLibreViewerProps extends Viewer3DProps {
  onError?: () => void
}

const mapStyle = 'https://tiles.openfreemap.org/styles/liberty'

const PROPOSED_SRC = 'proposed-building'
const PROPOSED_WALL = 'proposed-wall-extrusion'
const PROPOSED_ROOF = 'proposed-roof-extrusion'
const CITY_SRC = 'city-buildings'
const CITY_LAYER = 'city-buildings-extrusion'
const CITY_EDGE_LAYER = 'city-buildings-edge'
const PARCEL_SRC = 'parcel-outline'
const PARCEL_LAYER = 'parcel-outline-line'
const SPOTS_SRC = 'available-spots'
const SPOTS_LAYER = 'available-spots-circle'
const SPOTS_GLOW_LAYER = 'available-spots-glow'
const LABEL_SRC = 'building-labels'
const LABEL_LAYER = 'building-labels-symbol'
const ORTHO_SRC = 'bw-ortho'
const ORTHO_LAYER = 'bw-ortho-raster'
const ORTHO_TILE = 'https://owsproxy.lgl-bw.de/owsproxy/ows/WMS_LGL-BW_ATKIS_DOP_20_C?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=IMAGES_DOP_20_RGB&STYLES=&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png'

/** Build a FeatureCollection of Point labels at each proposed building's centroid. */
function buildLabelFC(proposed: Viewer3DProps['proposed']): GeoJSON.FeatureCollection {
  if (!proposed) return { type: 'FeatureCollection', features: [] }
  try {
    const ring = proposed.footprint.coordinates[0]
    if (!ring?.length) return { type: 'FeatureCollection', features: [] }
    let cx = 0, cy = 0
    const n = ring.length - 1
    for (let i = 0; i < n; i++) { cx += ring[i][0]; cy += ring[i][1] }
    cx /= n; cy /= n
    const h = Math.round(proposed.heightM)
    const label = `${h} m`
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { label },
        geometry: { type: 'Point', coordinates: [cx, cy] },
      }],
    }
  } catch {
    return { type: 'FeatureCollection', features: [] }
  }
}

/**
 * Stamp a deterministic `tint` ∈ [0,1] on each city building feature,
 * derived from a hash of its first coordinate. Stable across renders.
 */
function tintCityFeatures(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => {
      let tint = 0.5
      try {
        const coords = (f.geometry as GeoJSON.Polygon).coordinates?.[0]?.[0]
        if (coords) {
          const v = Math.sin(coords[0] * 12.9898 + coords[1] * 78.233) * 43758.5453
          tint = v - Math.floor(v) // fract
        }
      } catch { /* keep default */ }
      return { ...f, properties: { ...f.properties, tint } }
    }),
  }
}

const CITY_PAINT = {
  'fill-extrusion-color': [
    'interpolate', ['linear'], ['to-number', ['get', 'tint'], 0.5],
    0.0, '#cdb9a3',   // warm beige
    0.25, '#c2c4bd',  // light grey-green
    0.5, '#b7a795',   // sand
    0.75, '#a9b0b6',  // cool grey-blue
    1.0, '#9d8f7e',   // taupe
  ] as unknown as string,
  'fill-extrusion-height': ['case', ['has', 'height'], ['to-number', ['get', 'height'], 8], 8] as unknown as number,
  'fill-extrusion-base': 0,
  'fill-extrusion-opacity': 0.92,
  'fill-extrusion-vertical-gradient': true,
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

export default function MapLibreViewer({
  center,
  cityBuildings,
  proposed,
  spots,
  onSpotClick,
  parcelOutline,
  onReady,
  onError,
}: MapLibreViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [orthoVisible, setOrthoVisible] = useState(false)

  const proposedFC = useMemo(() => {
    if (!proposed) return EMPTY_FC
    return buildProposedFeatures(
      proposed.footprint,
      proposed.heightM,
      proposed.roofType,
      proposed.roofPitchDeg ?? 35,
      proposed.compliant,
      proposed.rotationDeg ?? 0,
    )
  }, [proposed])

  const labelsFC = useMemo(() => buildLabelFC(proposed), [proposed])

  const spotsFC = useMemo((): GeoJSON.FeatureCollection => {
    if (!spots?.length) return EMPTY_FC
    return {
      type: 'FeatureCollection',
      features: spots.map((s, i) => ({
        type: 'Feature' as const,
        properties: { id: i },
        geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
      })),
    }
  }, [spots])

  const ensureCityLayer = useCallback((map: MlMap, data: typeof cityBuildings) => {
    if (!data?.features.length) return
    const tinted = tintCityFeatures(data)
    const existing = map.getSource(CITY_SRC) as GeoJSONSource | undefined
    if (existing) {
      existing.setData(tinted)
    } else {
      map.addSource(CITY_SRC, { type: 'geojson', data: tinted })
      map.addLayer({
        id: CITY_LAYER,
        type: 'fill-extrusion',
        source: CITY_SRC,
        paint: CITY_PAINT,
      })
      // Crisp footprint edges so buildings read as distinct structures.
      try {
        map.addLayer({
          id: CITY_EDGE_LAYER,
          type: 'line',
          source: CITY_SRC,
          paint: {
            'line-color': '#5a5550',
            'line-width': 0.6,
            'line-opacity': 0.35,
          },
        })
      } catch { /* edge layer unsupported — skip */ }
    }
  }, [])

  // Init map once.
  useEffect(() => {
    let disposed = false
    let map: MlMap | null = null

    ;(async () => {
      try {
        const maplibregl = await import('maplibre-gl')
        await import('maplibre-gl/dist/maplibre-gl.css')
        if (disposed || !containerRef.current) return

        map = new maplibregl.Map({
          container: containerRef.current,
          style: mapStyle as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          center: [center.lon, center.lat],
          zoom: 17.5,
          pitch: 50,
          bearing: -15,
          attributionControl: false,
        })
        mapRef.current = map
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')

        map.once('load', () => {
          if (disposed || !map) return

          // BW orthophoto underlay (hidden by default).
          try {
            map.addSource(ORTHO_SRC, {
              type: 'raster',
              tiles: [ORTHO_TILE],
              tileSize: 256,
              attribution: 'Datengrundlage: LGL, www.lgl-bw.de',
            })
            map.addLayer({
              id: ORTHO_LAYER,
              type: 'raster',
              source: ORTHO_SRC,
              layout: { visibility: 'none' },
              paint: { 'raster-opacity': 1 },
            })
          } catch { /* ortho source unavailable — skip */ }

          // City buildings.
          if (cityBuildings?.features.length) {
            ensureCityLayer(map, cityBuildings)
          }

          // Green spots — available building sites.
          map.addSource(SPOTS_SRC, { type: 'geojson', data: spotsFC })
          map.addLayer({
            id: SPOTS_GLOW_LAYER,
            type: 'circle',
            source: SPOTS_SRC,
            paint: {
              'circle-radius': 14,
              'circle-color': '#2DD4A8',
              'circle-opacity': 0.15,
              'circle-blur': 0.8,
            },
          })
          map.addLayer({
            id: SPOTS_LAYER,
            type: 'circle',
            source: SPOTS_SRC,
            paint: {
              'circle-radius': 7,
              'circle-color': '#2DD4A8',
              'circle-opacity': 0.85,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-opacity': 0.9,
            },
          })

          // Click handler for spots.
          map.on('click', SPOTS_LAYER, (e) => {
            if (!e.features?.length) return
            const coords = (e.features[0].geometry as GeoJSON.Point).coordinates
            onSpotClick?.({ lon: coords[0], lat: coords[1] })
          })
          map.on('mouseenter', SPOTS_LAYER, () => { map!.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', SPOTS_LAYER, () => { map!.getCanvas().style.cursor = '' })

          // Proposed building source (initially empty).
          map.addSource(PROPOSED_SRC, { type: 'geojson', data: proposedFC })
          map.addLayer({
            id: PROPOSED_WALL,
            type: 'fill-extrusion',
            source: PROPOSED_SRC,
            filter: ['==', ['get', 'part'], 'wall'],
            paint: {
              'fill-extrusion-color': ['case', ['==', ['get', 'compliant'], false], '#D42B1A', '#2D8E6E'] as unknown as string,
              'fill-extrusion-height': ['to-number', ['get', 'height'], 0],
              'fill-extrusion-base': ['to-number', ['get', 'base'], 0],
              'fill-extrusion-opacity': 1,
            },
          })
          map.addLayer({
            id: PROPOSED_ROOF,
            type: 'fill-extrusion',
            source: PROPOSED_SRC,
            filter: ['==', ['get', 'part'], 'roof'],
            paint: {
              'fill-extrusion-color': ['case', ['==', ['get', 'compliant'], false], '#B81E10', '#238060'] as unknown as string,
              'fill-extrusion-height': ['to-number', ['get', 'height'], 0],
              'fill-extrusion-base': ['to-number', ['get', 'base'], 0],
              'fill-extrusion-opacity': 1,
            },
          })

          // Building height labels (above extrusions).
          try {
            map.addSource(LABEL_SRC, { type: 'geojson', data: labelsFC })
            map.addLayer({
              id: LABEL_LAYER,
              type: 'symbol',
              source: LABEL_SRC,
              layout: {
                'text-field': ['get', 'label'],
                'text-size': 12,
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-anchor': 'center',
                'text-allow-overlap': true,
              },
              paint: {
                'text-color': '#FFFFFF',
                'text-halo-color': '#1a1a1a',
                'text-halo-width': 1.5,
              },
            })
          } catch { /* labels unsupported — skip */ }

          // Parcel outline.
          if (parcelOutline) {
            map.addSource(PARCEL_SRC, {
              type: 'geojson',
              data: { type: 'Feature', properties: {}, geometry: parcelOutline },
            })
            map.addLayer({
              id: PARCEL_LAYER,
              type: 'line',
              source: PARCEL_SRC,
              paint: {
                'line-color': '#2A9D8F',
                'line-width': 2.5,
                'line-dasharray': [4, 3],
                'line-opacity': 0.85,
              },
            })
          }

          // ── Cosmetics (each guarded so a failure can never blank the map) ──
          try {
            // Hide the basemap's own buildings (vector source-layer 'building')
            // so they don't clash with our extrusions. This matches ONLY the
            // basemap's vector layers — our GeoJSON building layer has no
            // source-layer, so it can never be hidden.
            for (const l of map.getStyle().layers) {
              if ((l as { 'source-layer'?: string })['source-layer'] === 'building') {
                map.setLayoutProperty(l.id, 'visibility', 'none')
              }
            }
          } catch { /* no building layer in style — fine */ }

          try {
            map.setSky({
              'sky-color': '#b9d4e8', 'sky-horizon-blend': 0.6,
              'horizon-color': '#eef3f6', 'horizon-fog-blend': 0.5,
              'fog-color': '#f3f1ec', 'fog-ground-blend': 0.7, 'atmosphere-blend': 0.8,
            })
          } catch { /* sky unsupported — skip */ }

          try {
            map.setLight({ anchor: 'viewport', color: '#fff7ec', intensity: 0.55, position: [1.5, 120, 70] })
          } catch { /* light unsupported — skip */ }

          // Depth / AO on city buildings — ignored silently if unsupported.
          try {
            map.setPaintProperty(CITY_LAYER, 'fill-extrusion-ambient-occlusion-intensity', 0.25)
            map.setPaintProperty(CITY_LAYER, 'fill-extrusion-ambient-occlusion-radius', 60)
          } catch { /* AO unsupported in this MapLibre version — skip */ }

          try {
            map.easeTo({ zoom: 17.8, pitch: 55, bearing: -18, duration: 1200 })
          } catch { /* ignore */ }

          setMapReady(true)
          onReady?.()
        })
      } catch {
        if (!disposed) onError?.()
      }
    })()

    return () => {
      disposed = true
      setMapReady(false)
      map?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update city buildings.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !cityBuildings?.features.length) return
    ensureCityLayer(map, cityBuildings)
  }, [cityBuildings, mapReady, ensureCityLayer])

  // Update spots.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const src = map.getSource(SPOTS_SRC) as GeoJSONSource | undefined
    if (src) src.setData(spotsFC)
  }, [spotsFC, mapReady])

  // Live-update the proposed building + labels.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const src = map.getSource(PROPOSED_SRC) as GeoJSONSource | undefined
    if (src) src.setData(proposedFC)
    try {
      const labelSrc = map.getSource(LABEL_SRC) as GeoJSONSource | undefined
      if (labelSrc) labelSrc.setData(labelsFC)
    } catch { /* ignore */ }
  }, [proposedFC, labelsFC, mapReady])

  // Frame the camera on the placed building (or the parcel).
  const focusKeyRef = useRef<string>('')
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const geom = proposed?.footprint ?? parcelOutline
    const ring = geom?.coordinates?.[0]
    if (!ring?.length) return
    let cx = 0, cy = 0
    const n = ring.length - 1
    for (let i = 0; i < n; i++) { cx += ring[i][0]; cy += ring[i][1] }
    cx /= n; cy /= n
    const key = `${proposed ? 'b' : 'p'}:${cx.toFixed(5)},${cy.toFixed(5)}`
    if (key === focusKeyRef.current) return
    focusKeyRef.current = key
    try {
      map.easeTo({ center: [cx, cy], zoom: proposed ? 18.2 : 17.4, pitch: 55, duration: 900 })
    } catch { /* ignore */ }
  }, [proposed, parcelOutline, mapReady])

  // Sync ortho layer visibility.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    try {
      if (map.getLayer(ORTHO_LAYER)) {
        map.setLayoutProperty(ORTHO_LAYER, 'visibility', orthoVisible ? 'visible' : 'none')
      }
    } catch { /* ignore */ }
  }, [orthoVisible, mapReady])

  // Parcel outline updates.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !parcelOutline) return
    const existing = map.getSource(PARCEL_SRC) as GeoJSONSource | undefined
    if (existing) {
      existing.setData({ type: 'Feature', properties: {}, geometry: parcelOutline })
    } else {
      map.addSource(PARCEL_SRC, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: parcelOutline },
      })
      map.addLayer({
        id: PARCEL_LAYER,
        type: 'line',
        source: PARCEL_SRC,
        paint: {
          'line-color': '#2A9D8F',
          'line-width': 2.5,
          'line-dasharray': [4, 3],
          'line-opacity': 0.85,
        },
      })
    }
  }, [parcelOutline, mapReady])

  return (
    <div className="relative h-full w-full bg-[#15171A]">
      <div ref={containerRef} className="h-full w-full" />
      {mapReady && (
        <button
          type="button"
          onClick={() => setOrthoVisible((v) => !v)}
          className="absolute bottom-6 left-3 z-10 rounded bg-white/90 px-2.5 py-1 text-xs font-medium text-gray-700 shadow backdrop-blur hover:bg-white"
        >
          {orthoVisible ? 'Map' : 'Satellite'}
        </button>
      )}
    </div>
  )
}
