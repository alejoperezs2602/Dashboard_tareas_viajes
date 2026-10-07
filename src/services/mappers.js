import { parseCustomDate, normalizeDateString } from '../utils/dateUtils.js';

/**
 * Sanitizes a string to be used as a valid Firestore Document ID.
 * Removes slashes and special characters.
 */
export function sanitizeId(id) {
  if (!id) return `auto_${Date.now()}`;
  return String(id).replace(/[\/\\#\?]/g, '-').trim();
}

/**
 * Converts a DD/MM/YYYY string to YYYY-MM-DD for correct DB sorting/indexing.
 */
export function toISOFormat(dateStr) {
  const d = parseCustomDate(dateStr);
  if (!d) return null;
  return d.toISOString().split('T')[0];
}

/**
 * Converts YYYY-MM-DD back to DD/MM/YYYY for the UI.
 */
export function toLocalFormat(isoStr) {
  if (!isoStr) return '';
  const parts = isoStr.split('-');
  if (parts.length !== 3) return isoStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Maps a trip object from the Excel parser to a Firestore document.
 */
export function tripToDoc(trip) {
  const fechaISO = toISOFormat(trip.fecha) || '';
  
  const doc = {
    // metadata
    id: sanitizeId(trip.viaje),
    fechaISO,
    
    // fields
    viaje: trip.viaje || '',
    interno: trip.interno || '',
    placa: trip.placa || '',
    ruta: trip.ruta || '',
    rodamiento: trip.rodamiento || '',
    totalDiferencia: trip.totalDiferencia || 0,
    totalDistancia: trip.totalDistancia || 0,
    
    // Arrays
    conductoresArray: trip.conductoresArray || [],
    puntos: (trip.puntos || []).map(p => ({
      orden: p.orden,
      puesto: p.puesto || '',
      hora_est: p.hora_est || '',
      hora_real: p.hora_real || '',
      conductor: p.conductor || '',
      diferencia: p.diferencia || 0,
      distancia: p.distancia || 0
    })),

    // We don't overwrite 'planilla' field here, the merge will preserve it if it exists.
  };
  
  return doc;
}

/**
 * Maps a Firestore document back to the shape expected by the UI.
 */
export function docToTrip(doc) {
  return {
    viaje: doc.viaje,
    interno: doc.interno,
    placa: doc.placa,
    ruta: doc.ruta,
    rodamiento: doc.rodamiento,
    fecha: toLocalFormat(doc.fechaISO),
    totalDiferencia: doc.totalDiferencia,
    totalDistancia: doc.totalDistancia,
    conductoresArray: doc.conductoresArray || [],
    puntos: doc.puntos || [],
    planilla: doc.planilla || null
  };
}

/**
 * Compresses a Telemetry object for Firestore to save document size.
 * A single file may contain several days for the same vehicle, so we split
 * the points by date and return ONE document per vehicle per day.
 */
export function telemetryToDocs(veh) {
  const byDate = new Map();

  veh.puntos.forEach(p => {
    const fechaISO = toISOFormat(p.fecha || '') || '';
    if (!byDate.has(fechaISO)) byDate.set(fechaISO, []);
    byDate.get(fechaISO).push(p);
  });

  return Array.from(byDate.entries()).map(([fechaISO, puntos]) => ({
    id: sanitizeId(`${veh.interno}_${fechaISO}`),
    interno: veh.interno,
    fechaISO,
    totalExcesos: puntos.filter(p => p.esExceso).length,
    // Compress keys to save bytes (1MiB limit per doc)
    pt: puntos.map(p => ({
      la: p.lat,
      ln: p.lng,
      v: p.velocidad,
      h: p.hora || '',
      c: p.conductor || '',
      x: p.esExceso ? 1 : 0
    }))
  }));
}

/**
 * Decompresses a Firestore Telemetry doc back to UI shape.
 */
export function docToTelemetry(doc) {
  const localDate = toLocalFormat(doc.fechaISO);
  
  return {
    interno: doc.interno,
    excesos: doc.totalExcesos,
    // Decompress keys
    puntos: (doc.pt || []).map((p, index) => ({
      lat: p.la,
      lng: p.ln,
      velocidad: p.v,
      hora: p.h,
      conductor: p.c,
      fecha: localDate, // Apply the doc's date to all points
      esExceso: p.x === 1,
      index: index
    }))
  };
}
