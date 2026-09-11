import { SPEED_LIMIT_KMH } from '../constants/index.js';
export function parseTelemetry(data) {
  // data comes from XLSX.utils.sheet_to_json(worksheet) (array of objects)
  // We want to group by "Numero interno"

  const vehiclesMap = {};
  if (!data || !Array.isArray(data)) return [];

  data.forEach((row, index) => {
    // Normalizar llaves para tolerar diferencias de mayúsculas o espacios
    const normalizedRow = {};
    Object.keys(row).forEach(k => {
      normalizedRow[k.trim().toLowerCase()] = row[k];
    });

    // Extraer columnas clave
    const numInterno = normalizedRow['numero interno'] || normalizedRow['n° interno'] || normalizedRow['interno'] || 'DESCONOCIDO';
    const conductor = normalizedRow['conductor'] || 'DESCONOCIDO';
    const lat = parseFloat(String(normalizedRow['latitud'] || '').replace(',', '.'));
    const lng = parseFloat(String(normalizedRow['longitud'] || '').replace(',', '.'));
    const velocidad = parseFloat(String(normalizedRow['velocidad'] || '').replace(',', '.')) || 0;
    
    // Extraer fecha y hora de forma robusta
    let rawFecha = normalizedRow['fecha'] || normalizedRow['fecha del viaje'] || normalizedRow['date'] || '';
    let rawHora = normalizedRow['hora'] || normalizedRow['time'] || '';

    // Si la fecha viene combinada "DD/MM/YYYY HH:mm:ss" o "MM/DD/YY H:mm"
    if (rawFecha && String(rawFecha).includes(' ') && !rawHora) {
      let parts = String(rawFecha).trim().split(' ');
      rawFecha = parts[0];
      rawHora = parts.slice(1).join(' '); // El resto es la hora
    }

    // Normalizar formato de fecha (eliminar espacios)
    const fecha = rawFecha ? String(rawFecha).trim() : null;
    const hora = rawHora ? String(rawHora).trim() : null;

    // Solo procesar si tenemos coordenadas válidas
    if (isNaN(lat) || isNaN(lng)) return;

    if (!vehiclesMap[numInterno]) {
      vehiclesMap[numInterno] = {
        interno: numInterno,
        conductores: new Set(),
        puntos: [],
        excesos: 0
      };
    }

    vehiclesMap[numInterno].conductores.add(conductor);
    
    const point = {
      lat,
      lng,
      velocidad,
      conductor,
      fecha,
      hora,
      esExceso: velocidad > SPEED_LIMIT_KMH,
      index: index
    };

    if (point.esExceso) {
      vehiclesMap[numInterno].excesos++;
    }

    vehiclesMap[numInterno].puntos.push(point);
  });

  // Convert Sets to Arrays and return
  const result = Object.values(vehiclesMap).map(v => ({
    ...v,
    conductores: Array.from(v.conductores)
  }));

  return result;
}
