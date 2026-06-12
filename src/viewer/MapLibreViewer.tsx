import { useEffect, useRef } from 'react'
import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl'
import type { Viewer3DProps } from './Viewer3D.types'

interface MapLibreViewerProps extends Viewer3DProps {
  /** Called if MapLibre can't initialise (no WebGL, style load failure) so the
   *  caller can fall back to the schematic placeholder — protects the demo. */
  onError?: () => void
}

// Key-free basemap (no token). OpenFreeMap positron suits the muted aesthetic.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

const PROPOSED_SRC = 'proposed-building'
const PROPOSED_LAYER = 'proposed-building-extrusion'
const CITY_SRC = 'city-buildings'
const CITY_LAYER = 'city-buildings-extrusion'

function proposedColor(compliant: boolean): string {
  // red if non-compliant, warmer amber-red if compliant (§4 interface).
  return compliant ? '#D7503F' : '#C2362B'
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
  const readyRef = useRef(false)

  // Init once.
  useEffect(() => {
    let disposed = false
    let map: MlMap | null = null

    ;(async () => {
      try {
        const maplibregl = (await import('maplibre-gl')).default
        await import('maplibre-gl/dist/maplibre-gl.css')
        if (disposed || !containerRef.current) return

        map = new maplibregl.Map({
          container: containerRef.current,
          style: STYLE_URL,
          center: [center.lon, center.lat],
          zoom: 17.6,
          pitch: 58,
          bearing: -22,
          attributionControl: false,
        })
        mapRef.current = map
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')

        map.on('error', (e) => {
          // Tile/style errors shouldn't blank the demo; surface only fatal ones.
          if (!readyRef.current) {
            // eslint-disable-next-line no-console
            console.warn('MapLibre error before ready:', e?.error?.message)
          }
        })

        map.once('load', () => {
          if (disposed || !map) return
          // City backdrop (grey extrusions) — optional.
          if (cityBuildings && cityBuildings.features.length) {
            map.addSource(CITY_SRC, { type: 'geojson', data: cityBuildings })
            map.addLayer({
              id: CITY_LAYER,
              type: 'fill-extrusion',
              source: CITY_SRC,
              paint: {
                'fill-extrusion-color': '#9a958a',
                'fill-extrusion-height': ['coalesce', ['get', 'height'], 8],
                'fill-extrusion-base': 0,
                'fill-extrusion-opacity': 0.85,
              },
            })
          }

          // Proposed building (red extrusion).
          map.addSource(PROPOSED_SRC, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: proposed.footprint,
            },
          })
          map.addLayer({
            id: PROPOSED_LAYER,
            type: 'fill-extrusion',
            source: PROPOSED_SRC,
            paint: {
              'fill-extrusion-color': proposedColor(proposed.compliant),
              'fill-extrusion-height': Math.max(proposed.heightM, 0.5),
              'fill-extrusion-base': 0,
              'fill-extrusion-opacity': 0.92,
            },
          })

          readyRef.current = true
          onReady?.()
        })
      } catch {
        if (!disposed) onError?.()
      }
    })()

    return () => {
      disposed = true
      readyRef.current = false
      map?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live-update the proposed building when height / compliance / footprint change.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const src = map.getSource(PROPOSED_SRC) as GeoJSONSource | undefined
    if (src) {
      src.setData({ type: 'Feature', properties: {}, geometry: proposed.footprint })
    }
    if (map.getLayer(PROPOSED_LAYER)) {
      map.setPaintProperty(
        PROPOSED_LAYER,
        'fill-extrusion-height',
        Math.max(proposed.heightM, 0.5),
      )
      map.setPaintProperty(
        PROPOSED_LAYER,
        'fill-extrusion-color',
        proposedColor(proposed.compliant),
      )
    }
  }, [proposed.heightM, proposed.compliant, proposed.footprint])

  return <div ref={containerRef} className="h-full w-full bg-[#15171A]" />
}
