import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl'
import type { Viewer3DProps } from './Viewer3D.types'
import { buildProposedFeatures } from './buildingGeometry'

interface MapLibreViewerProps extends Viewer3DProps {
  onError?: () => void
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

// Use Mapbox Static Tiles API (raster) when a token is available; fall back to OpenFreeMap.
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
  : 'https://tiles.openfreemap.org/styles/positron'

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

function wallColor(compliant: boolean): string {
  return compliant ? '#E85040' : '#D42B1A'
}
function roofColor(compliant: boolean): string {
  return compliant ? '#CC3A2A' : '#B81E10'
}

const CITY_PAINT = {
  'fill-extrusion-color': '#a09b90',
  'fill-extrusion-height': ['case', ['has', 'height'], ['to-number', ['get', 'height'], 8], 8] as unknown as number,
  'fill-extrusion-base': 0,
  'fill-extrusion-opacity': 0.75,
  'fill-extrusion-vertical-gradient': true,
}

export default function MapLibreViewer({
  center,
  cityBuildings,
  proposed,
  onReady,
  onError,
}: MapLibreViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const [mapReady, setMapReady] = useState(false)

  const proposedFC = useMemo(
    () =>
      buildProposedFeatures(
        proposed.footprint,
        proposed.heightM,
        proposed.roofType,
        proposed.roofPitchDeg ?? 35,
        proposed.compliant,
      ),
    [proposed.footprint, proposed.heightM, proposed.roofType, proposed.roofPitchDeg, proposed.compliant],
  )

  // Shared helper to ensure city buildings layer exists on the map.
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

          // City buildings — add if already available.
          if (cityBuildings?.features.length) {
            ensureCityLayer(map, cityBuildings)
          }

          // Proposed building — multi-part source (walls + roof).
          map.addSource(PROPOSED_SRC, { type: 'geojson', data: proposedFC })
          map.addLayer({
            id: PROPOSED_WALL,
            type: 'fill-extrusion',
            source: PROPOSED_SRC,
            filter: ['==', ['get', 'part'], 'wall'],
            paint: {
              'fill-extrusion-color': wallColor(proposed.compliant),
              'fill-extrusion-height': ['to-number', ['get', 'height'], 0],
              'fill-extrusion-base': ['to-number', ['get', 'base'], 0],
              'fill-extrusion-opacity': 0.95,
            },
          })
          map.addLayer({
            id: PROPOSED_ROOF,
            type: 'fill-extrusion',
            source: PROPOSED_SRC,
            filter: ['==', ['get', 'part'], 'roof'],
            paint: {
              'fill-extrusion-color': roofColor(proposed.compliant),
              'fill-extrusion-height': ['to-number', ['get', 'height'], 0],
              'fill-extrusion-base': ['to-number', ['get', 'base'], 0],
              'fill-extrusion-opacity': 0.95,
            },
          })

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

  // Add/update city buildings when data arrives OR when map becomes ready.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !cityBuildings?.features.length) return
    ensureCityLayer(map, cityBuildings)
  }, [cityBuildings, mapReady, ensureCityLayer])

  // Live-update the proposed building.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const src = map.getSource(PROPOSED_SRC) as GeoJSONSource | undefined
    if (src) src.setData(proposedFC)
    if (map.getLayer(PROPOSED_WALL)) {
      map.setPaintProperty(PROPOSED_WALL, 'fill-extrusion-color', wallColor(proposed.compliant))
    }
    if (map.getLayer(PROPOSED_ROOF)) {
      map.setPaintProperty(PROPOSED_ROOF, 'fill-extrusion-color', roofColor(proposed.compliant))
    }
  }, [proposedFC, proposed.compliant, mapReady])

  return <div ref={containerRef} className="h-full w-full bg-[#15171A]" />
}
