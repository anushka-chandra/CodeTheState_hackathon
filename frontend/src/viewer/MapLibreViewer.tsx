import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl'
import type { Viewer3DProps } from './Viewer3D.types'
import { buildProposedFeatures } from './buildingGeometry'

interface MapLibreViewerProps extends Viewer3DProps {
  onError?: () => void
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

const mapStyle: string | maplibreStyle = MAPBOX_TOKEN
  ? {
      version: 8 as const,
      sources: {
        'mapbox-base': {
          type: 'raster' as const,
          tiles: [
            `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`,
          ],
          tileSize: 512,
          attribution: '&copy; <a href="https://www.mapbox.com/">Mapbox</a>',
        },
      },
      layers: [{ id: 'base', type: 'raster' as const, source: 'mapbox-base' }],
    }
  : 'https://tiles.openfreemap.org/styles/liberty'

type maplibreStyle = {
  version: 8
  sources: Record<string, unknown>
  layers: unknown[]
}

const PROPOSED_SRC = 'proposed-building'
const PROPOSED_WALL = 'proposed-wall-extrusion'
const PROPOSED_ROOF = 'proposed-roof-extrusion'
const CITY_SRC = 'city-buildings'
const CITY_LAYER = 'city-buildings-extrusion'
const PARCEL_SRC = 'parcel-outline'
const PARCEL_LAYER = 'parcel-outline-line'
const SPOTS_SRC = 'available-spots'
const SPOTS_LAYER = 'available-spots-circle'
const SPOTS_GLOW_LAYER = 'available-spots-glow'

function wallColor(compliant: boolean): string {
  return compliant ? '#2D8E6E' : '#D42B1A'
}
function roofColor(compliant: boolean): string {
  return compliant ? '#238060' : '#B81E10'
}

const CITY_PAINT = {
  'fill-extrusion-color': '#a09b90',
  'fill-extrusion-height': ['case', ['has', 'height'], ['to-number', ['get', 'height'], 8], 8] as unknown as number,
  'fill-extrusion-base': 0,
  'fill-extrusion-opacity': 0.75,
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

  const proposedFC = useMemo(() => {
    if (!proposed) return EMPTY_FC
    return buildProposedFeatures(
      proposed.footprint,
      proposed.heightM,
      proposed.roofType,
      proposed.roofPitchDeg ?? 35,
      proposed.compliant,
    )
  }, [proposed])

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
    const existing = map.getSource(CITY_SRC) as GeoJSONSource | undefined
    if (existing) {
      existing.setData(data)
    } else {
      map.addSource(CITY_SRC, { type: 'geojson', data })
      map.addLayer({
        id: CITY_LAYER,
        type: 'fill-extrusion',
        source: CITY_SRC,
        paint: CITY_PAINT,
      })
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
              'fill-extrusion-color': wallColor(proposed?.compliant ?? true),
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
              'fill-extrusion-color': roofColor(proposed?.compliant ?? true),
              'fill-extrusion-height': ['to-number', ['get', 'height'], 0],
              'fill-extrusion-base': ['to-number', ['get', 'base'], 0],
              'fill-extrusion-opacity': 1,
            },
          })

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

  // Live-update the proposed building.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const src = map.getSource(PROPOSED_SRC) as GeoJSONSource | undefined
    if (src) src.setData(proposedFC)
    const compliant = proposed?.compliant ?? true
    if (map.getLayer(PROPOSED_WALL)) {
      map.setPaintProperty(PROPOSED_WALL, 'fill-extrusion-color', wallColor(compliant))
    }
    if (map.getLayer(PROPOSED_ROOF)) {
      map.setPaintProperty(PROPOSED_ROOF, 'fill-extrusion-color', roofColor(compliant))
    }
  }, [proposedFC, proposed?.compliant, mapReady])

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

  return <div ref={containerRef} className="h-full w-full bg-[#15171A]" />
}
