import type { FeatureCollection, Polygon } from 'geojson'
import type { RoofType } from '../types'

export interface Viewer3DProps {
  /** EPSG:4326 lon/lat of the plan-area centroid. */
  center: { lon: number; lat: number }
  /** Existing city buildings (LOD2 → GeoJSON), optional grey backdrop. */
  cityBuildings?: FeatureCollection
  /** The proposed building — null/undefined means no building placed yet. */
  proposed?: {
    footprint: Polygon
    heightM: number
    roofType: RoofType
    roofPitchDeg?: number
    compliant: boolean
    rotationDeg?: number
  } | null
  /** Green available-site markers the user can click to place a building. */
  spots?: { lon: number; lat: number }[]
  /** Fired when the user clicks one of the green spots. */
  onSpotClick?: (center: { lon: number; lat: number }) => void
  /** Cadastral parcel outline to render as a dashed boundary. */
  parcelOutline?: Polygon
  /** Highlight a specific city building by index (nearest reference). */
  highlightBuildingId?: string
  onReady?: () => void
}
