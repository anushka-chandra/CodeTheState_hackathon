import type { FeatureCollection, Polygon } from 'geojson'
import type { RoofType } from '../types'

/**
 * The single interface every 3D viewer implementation honours. The whole app is
 * built against this + a placeholder; a real library (MapLibre, then maybe
 * Cesium) is wired in last and must satisfy exactly this shape (§4).
 */
export interface Viewer3DProps {
  /** EPSG:4326 lon/lat of the plan-area centroid. */
  center: { lon: number; lat: number }
  /** Existing city buildings (LOD2 → GeoJSON), optional grey backdrop. */
  cityBuildings?: FeatureCollection
  /** The proposed building: footprint polygon + live attributes. */
  proposed: {
    footprint: Polygon // EPSG:4326
    heightM: number // re-renders live when edited
    roofType: RoofType
    roofPitchDeg?: number
    compliant: boolean // red if false, amber-red if true
  }
  onReady?: () => void
}
