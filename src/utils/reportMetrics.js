import { SPEED_LIMIT_KMH } from '../constants/index.js';
import { parseCustomDate, timeToMs, matchDate } from './dateUtils.js';

// ─── Reglas de negocio de los reportes ─────────────────────────────────────
export const EVENT_GAP_MS = 2 * 60 * 1000;          // registros a ≤ 2 min = mismo evento
export const TRIP_MATCH_TOLERANCE_MS = 5 * 60 * 1000; // margen para ubicar un evento dentro de un viaje
export const SEVERITY = {
  LEVE: { key: 'LEVE', label: 'Leve', max: 90 },
  MODERADO: { key: 'MODERADO', label: 'Moderado', max: 100 },
  GRAVE: { key: 'GRAVE', label: 'Grave', max: Infinity },
};

export function severityOf(speed) {
  if (speed <= SEVERITY.LEVE.max) return SEVERITY.LEVE;
  if (speed <= SEVERITY.MODERADO.max) return SEVERITY.MODERADO;
  return SEVERITY.GRAVE;
}

// ─── Helpers ───────────────────────────────────────────────────────────────
export function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

const keyOf = (v) => String(v ?? '').trim();

function dateKey(d) {
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hasTime(t) {
  return t !== undefined && t !== null && String(t).trim() !== '';
}

/** Puntos de control ordenados y con hora utilizable. */
function tripTimes(trip) {
  const pts = [...(trip.puntos || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const times = pts
    .map(p => (hasTime(p.hora_real) ? p.hora_real : p.hora_est))
    .filter(hasTime)
    .map(timeToMs);
  return times;
}

function tripDepartureMs(trip) {
  const times = tripTimes(trip);
  return times.length ? times[0] : null;
}

function getPlanillaConductor(trip, planillasMap) {
  const id = keyOf(trip.viaje);
  if (planillasMap && planillasMap.has(id) && keyOf(planillasMap.get(id))) return keyOf(planillasMap.get(id));
  if (trip.planilla && keyOf(trip.planilla.conductor)) return keyOf(trip.planilla.conductor);
  return null;
}

function mainConductor(trip, planillasMap) {
  return getPlanillaConductor(trip, planillasMap)
    || (trip.conductoresArray && trip.conductoresArray[0])
    || (trip.puntos || []).find(p => p.conductor)?.conductor
    || 'SIN CONDUCTOR';
}

function sortByDateTime(a, b) {
  const da = a.fecha ? a.fecha.getTime() : 0;
  const db = b.fecha ? b.fecha.getTime() : 0;
  if (da !== db) return da - db;
  return (a.horaMs ?? 0) - (b.horaMs ?? 0);
}

// ─── Reporte 1: Viajes por conductor ───────────────────────────────────────
/**
 * Solo cuenta viajes cuyo código cruza con una planilla que tenga conductor.
 */
export function buildViajesPorConductor(trips, planillasMap, { conductor: filtro } = {}) {
  const map = new Map();
  let excluidos = 0;
  let totalConPlanilla = 0;

  trips.forEach(t => {
    const cond = getPlanillaConductor(t, planillasMap);
    if (!cond) { excluidos++; return; }
    const nombre = normalizeName(cond);
    if (filtro && filtro !== 'ALL' && nombre !== normalizeName(filtro)) return;
    totalConPlanilla++;

    if (!map.has(nombre)) {
      map.set(nombre, { conductor: nombre, dias: new Set(), vehiculos: new Set(), rutas: new Set(), viajes: [] });
    }
    const entry = map.get(nombre);
    const fecha = parseCustomDate(t.fecha);
    if (fecha) entry.dias.add(dateKey(fecha));
    if (t.interno) entry.vehiculos.add(keyOf(t.interno));
    if (t.ruta) entry.rutas.add(keyOf(t.ruta));
    entry.viajes.push({
      fecha,
      viaje: keyOf(t.viaje),
      interno: keyOf(t.interno),
      placa: keyOf(t.placa),
      ruta: keyOf(t.ruta),
      horaMs: tripDepartureMs(t),
    });
  });

  const conductores = [...map.values()].map(e => ({
    conductor: e.conductor,
    totalViajes: e.viajes.length,
    diasTrabajados: e.dias.size,
    promedioDia: e.dias.size ? e.viajes.length / e.dias.size : 0,
    vehiculos: [...e.vehiculos].sort(),
    rutas: [...e.rutas].sort(),
    porcentaje: totalConPlanilla ? e.viajes.length / totalConPlanilla : 0,
    viajes: e.viajes.sort(sortByDateTime),
  })).sort((a, b) => b.totalViajes - a.totalViajes || a.conductor.localeCompare(b.conductor));

  return {
    conductores,
    totalViajes: totalConPlanilla,
    totalConductores: conductores.length,
    promedioPorConductor: conductores.length ? totalConPlanilla / conductores.length : 0,
    excluidos,
  };
}

// ─── Reporte 2: Kilometraje ────────────────────────────────────────────────
export function buildKilometraje(trips, planillasMap, { vehiculo: filtro } = {}) {
  const map = new Map();

  trips.forEach(t => {
    const interno = keyOf(t.interno) || 'N/D';
    if (filtro && filtro !== 'ALL' && interno !== keyOf(filtro)) return;
    if (!map.has(interno)) map.set(interno, { interno, placa: keyOf(t.placa), viajes: [] });
    const entry = map.get(interno);
    if (!entry.placa && t.placa) entry.placa = keyOf(t.placa);
    entry.viajes.push({
      fecha: parseCustomDate(t.fecha),
      viaje: keyOf(t.viaje),
      ruta: keyOf(t.ruta),
      conductor: normalizeName(mainConductor(t, planillasMap)),
      km: Number(t.totalDistancia) || 0,
      horaMs: tripDepartureMs(t),
    });
  });

  let kmFlota = 0;
  let viajesFlota = 0;

  const vehiculos = [...map.values()].map(e => {
    e.viajes.sort(sortByDateTime);
    const porDia = new Map();
    e.viajes.forEach(v => {
      const k = dateKey(v.fecha) || 'sin-fecha';
      if (!porDia.has(k)) porDia.set(k, { fecha: v.fecha, km: 0, viajes: [] });
      const d = porDia.get(k);
      d.km += v.km;
      d.viajes.push(v);
    });
    const km = e.viajes.reduce((s, v) => s + v.km, 0);
    kmFlota += km;
    viajesFlota += e.viajes.length;
    return {
      interno: e.interno,
      placa: e.placa,
      totalViajes: e.viajes.length,
      km,
      kmPromViaje: e.viajes.length ? km / e.viajes.length : 0,
      diasOperados: porDia.size,
      kmPromDia: porDia.size ? km / porDia.size : 0,
      dias: [...porDia.values()],
    };
  }).sort((a, b) => b.km - a.km);

  vehiculos.forEach(v => { v.porcentaje = kmFlota ? v.km / kmFlota : 0; });

  return {
    vehiculos,
    kmFlota,
    viajesFlota,
    totalVehiculos: vehiculos.length,
    kmPromVehiculo: vehiculos.length ? kmFlota / vehiculos.length : 0,
    kmPromViaje: viajesFlota ? kmFlota / viajesFlota : 0,
  };
}

// ─── Reporte 3: Excesos de velocidad ───────────────────────────────────────
/** Une registros del mismo vehículo separados por ≤ EVENT_GAP_MS en un solo evento. */
export function groupSpeedingEvents(puntos) {
  const pts = puntos
    .filter(p => p.esExceso !== false && (Number(p.velocidad) || 0) > SPEED_LIMIT_KMH)
    .map(p => {
      const fecha = parseCustomDate(p.fecha);
      const horaMs = hasTime(p.hora) ? timeToMs(p.hora) : 0;
      return { ...p, _fecha: fecha, _horaMs: horaMs, _ts: (fecha ? fecha.getTime() : 0) + horaMs };
    })
    .sort((a, b) => a._ts - b._ts);

  const events = [];
  let current = null;
  pts.forEach(p => {
    if (current && p._ts - current.last._ts <= EVENT_GAP_MS && dateKey(p._fecha) === dateKey(current.first._fecha)) {
      current.points.push(p);
      current.last = p;
    } else {
      current = { first: p, last: p, points: [p] };
      events.push(current);
    }
  });

  return events.map(ev => {
    const speeds = ev.points.map(p => Number(p.velocidad) || 0);
    const velMax = Math.max(...speeds);
    const peak = ev.points[speeds.indexOf(velMax)];
    return {
      fecha: ev.first._fecha,
      horaMs: ev.first._horaMs,
      horaFinMs: ev.last._horaMs,
      duracionSeg: Math.max(0, Math.round((ev.last._ts - ev.first._ts) / 1000)),
      velMax,
      velProm: speeds.reduce((s, v) => s + v, 0) / speeds.length,
      registros: ev.points.length,
      lat: peak.lat,
      lng: peak.lng,
      conductorGPS: keyOf(peak.conductor),
    };
  });
}

/** Ubica el viaje en curso del vehículo al momento del evento. */
export function matchEventToTrip(evento, vehicleTrips) {
  for (const t of vehicleTrips) {
    if (!evento.fecha || !matchDate(t.fecha, `${evento.fecha.getDate()}/${evento.fecha.getMonth() + 1}/${evento.fecha.getFullYear()}`)) continue;
    const times = tripTimes(t);
    if (!times.length) continue;
    const start = Math.min(...times) - TRIP_MATCH_TOLERANCE_MS;
    const end = Math.max(...times) + TRIP_MATCH_TOLERANCE_MS;
    if (evento.horaMs >= start && evento.horaMs <= end) return t;
  }
  return null;
}

export function buildExcesos(telemetry, trips, planillasMap, { vehiculo: filtro } = {}) {
  const tripsByVeh = new Map();
  const placaByVeh = new Map();
  trips.forEach(t => {
    const k = keyOf(t.interno);
    if (!tripsByVeh.has(k)) tripsByVeh.set(k, []);
    tripsByVeh.get(k).push(t);
    if (t.placa && !placaByVeh.has(k)) placaByVeh.set(k, keyOf(t.placa));
  });

  const vehiculos = [];
  let maxFlota = null;
  const totalesGravedad = { LEVE: 0, MODERADO: 0, GRAVE: 0 };

  telemetry.forEach(veh => {
    const interno = keyOf(veh.interno);
    if (filtro && filtro !== 'ALL' && interno !== keyOf(filtro)) return;
    const eventos = groupSpeedingEvents(veh.puntos || []);
    if (!eventos.length) return;

    const vehTrips = tripsByVeh.get(interno) || [];
    const conductores = new Set();
    const gravedad = { LEVE: 0, MODERADO: 0, GRAVE: 0 };

    eventos.forEach(ev => {
      const trip = matchEventToTrip(ev, vehTrips);
      if (trip) {
        const planilla = getPlanillaConductor(trip, planillasMap);
        ev.conductor = normalizeName(planilla || mainConductor(trip, planillasMap));
        ev.fuenteConductor = planilla ? 'Planilla' : 'Tiempos';
        ev.viaje = keyOf(trip.viaje);
        ev.ruta = keyOf(trip.ruta);
      } else {
        const gps = ev.conductorGPS && ev.conductorGPS.toUpperCase() !== 'DESCONOCIDO' ? normalizeName(ev.conductorGPS) : 'SIN IDENTIFICAR';
        ev.conductor = `${gps} (GPS)`;
        ev.fuenteConductor = 'GPS';
        ev.viaje = '';
        ev.ruta = '';
      }
      ev.gravedad = severityOf(ev.velMax);
      gravedad[ev.gravedad.key]++;
      totalesGravedad[ev.gravedad.key]++;
      conductores.add(ev.conductor);
      if (!maxFlota || ev.velMax > maxFlota.velMax) maxFlota = { ...ev, interno };
    });

    eventos.sort(sortByDateTime);
    const totalRegistros = eventos.reduce((s, e) => s + e.registros, 0);
    const sumaVel = eventos.reduce((s, e) => s + e.velProm * e.registros, 0);

    vehiculos.push({
      interno,
      placa: placaByVeh.get(interno) || '',
      totalEventos: eventos.length,
      registros: totalRegistros,
      leves: gravedad.LEVE,
      moderados: gravedad.MODERADO,
      graves: gravedad.GRAVE,
      velMax: Math.max(...eventos.map(e => e.velMax)),
      velProm: totalRegistros ? sumaVel / totalRegistros : 0,
      tiempoTotalSeg: eventos.reduce((s, e) => s + e.duracionSeg, 0),
      conductores: [...conductores].sort(),
      eventos,
    });
  });

  vehiculos.sort((a, b) => b.totalEventos - a.totalEventos || b.velMax - a.velMax);

  return {
    vehiculos,
    totalEventos: vehiculos.reduce((s, v) => s + v.totalEventos, 0),
    totalRegistros: vehiculos.reduce((s, v) => s + v.registros, 0),
    vehiculosConExcesos: vehiculos.length,
    maxFlota,
    totalesGravedad,
  };
}

// ─── Punto de entrada ──────────────────────────────────────────────────────
export function buildReportMetrics({ trips = [], telemetry = [], planillasMap = null, filtros = {} }) {
  const fechasTrips = new Set();
  trips.forEach(t => { const d = parseCustomDate(t.fecha); if (d) fechasTrips.add(dateKey(d)); });
  const fechasTele = new Set();
  telemetry.forEach(v => (v.puntos || []).forEach(p => { const d = parseCustomDate(p.fecha); if (d) fechasTele.add(dateKey(d)); }));

  return {
    conductores: buildViajesPorConductor(trips, planillasMap, filtros),
    kilometraje: buildKilometraje(trips, planillasMap, filtros),
    excesos: buildExcesos(telemetry, trips, planillasMap, filtros),
    diasConViajes: [...fechasTrips].sort(),
    diasConTelemetria: [...fechasTele].sort(),
  };
}
