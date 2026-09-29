/**
 * Parses the "Planillas Intermunicipales" Excel file.
 * Returns a Map: { codigoViaje (string) → conductor (string) }
 * This map acts as the authoritative source of which trips were actually executed.
 */
export function parsePlanillas(flatData) {
  const planillasMap = new Map();

  if (!flatData || !Array.isArray(flatData) || flatData.length === 0) {
    return planillasMap;
  }

  for (const row of flatData) {
    // Normalize keys: trim whitespace and uppercase for robust matching
    const normalizedRow = {};
    for (const key of Object.keys(row)) {
      normalizedRow[String(key).trim().toUpperCase()] = row[key];
    }

    // Look for "VIAJE" column (matches "Codigo de Viaje" in Tareas y Viajes)
    const viajeRaw = normalizedRow['VIAJE'];
    const conductorRaw = normalizedRow['CONDUCTOR'];

    if (viajeRaw === undefined || viajeRaw === null || String(viajeRaw).trim() === '') {
      continue;
    }

    const codigoViaje = String(viajeRaw).trim();
    const conductor = conductorRaw ? String(conductorRaw).trim() : '';

    // Store in map. If duplicate viaje codes exist, the last one wins.
    planillasMap.set(codigoViaje, conductor);
  }

  return planillasMap;
}
