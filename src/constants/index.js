// Speed & safety
export const SPEED_LIMIT_KMH = 85;

// Punctuality tolerance (minutes)
export const PUNCTUALITY_TOLERANCE_MIN = 5;

// Risk matrix thresholds
export const RISK_DELAY_THRESHOLD = 30;
export const RISK_SPEED_THRESHOLD = 10;

// Default map coordinates (Colombia)
export const DEFAULT_MAP_CENTER = [4.6097, -74.0817];
export const DEFAULT_MAP_ZOOM = 13;

// File upload limits
export const MAX_FILE_SIZE_MB = 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Top N items
export const TOP_N_DEFAULT = 10;

// Map tile URL
export const MAP_TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
export const MAP_ATTRIBUTION = '&copy; OpenStreetMap contributors';

// Speeding marker style
export const SPEEDING_MARKER_STYLE = {
  color: '#ef4444',
  fillColor: '#ef4444',
  fillOpacity: 0.8,
  radius: 7
};

// Route polyline style  
export const ROUTE_POLYLINE_STYLE = {
  color: '#3b82f6',
  weight: 4,
  opacity: 0.6
};
