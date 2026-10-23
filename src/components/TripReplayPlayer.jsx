import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { timeToMs } from '../utils/dateUtils.js';
import {
  SPEED_LIMIT_KMH,
  PUNCTUALITY_TOLERANCE_MIN,
  DEFAULT_MAP_CENTER,
  MAP_TILE_URL,
  MAP_ATTRIBUTION
} from '../constants/index.js';

// Diccionario geográfico de puestos de control y municipios (Corredor Antioquia / Urabá / Córdoba)
const CHECKPOINT_COORDS = [
  { keys: ['TERMINAL DEL NORTE', 'TERM NORTE', 'TERMINAL NORTE'], lat: 6.2764, lng: -75.5708 },
  { keys: ['TERMINAL DEL SUR', 'TERM SUR', 'TERMINAL SUR'], lat: 6.2163, lng: -75.5878 },
  { keys: ['CARIBE', 'PUNTO CERO'], lat: 6.2705, lng: -75.5721 },
  { keys: ['ROBLEDO'], lat: 6.2750, lng: -75.5950 },
  { keys: ['SAN CRISTOBAL', 'CRISTOBAL'], lat: 6.2792, lng: -75.6361 },
  { keys: ['TUNEL DE OCCIDENTE', 'TUNEL OCCIDENTE'], lat: 6.2890, lng: -75.6540 },
  { keys: ['BOQUERON'], lat: 6.2925, lng: -75.6685 },
  { keys: ['PALMITAS', 'SAN SEBASTIAN DE PALMITAS'], lat: 6.3428, lng: -75.6897 },
  { keys: ['EL BRASIL'], lat: 6.3550, lng: -75.7350 },
  { keys: ['EBEJICO'], lat: 6.3267, lng: -75.7667 },
  { keys: ['MELONERA', 'LA MELONERA'], lat: 6.3950, lng: -75.7850 },
  { keys: ['SAN JERONIMO', 'JERONIMO'], lat: 6.4431, lng: -75.7281 },
  { keys: ['AURRA'], lat: 6.4650, lng: -75.7480 },
  { keys: ['SOPETRAN'], lat: 6.5019, lng: -75.7433 },
  { keys: ['PASO REAL'], lat: 6.5350, lng: -75.8150 },
  { keys: ['SANTA FE DE ANTIOQUIA', 'SANTA FE', 'STA FE'], lat: 6.5569, lng: -75.8281 },
  { keys: ['TONUSCO'], lat: 6.5650, lng: -75.8550 },
  { keys: ['PUENTE OCCIDENTE'], lat: 6.5780, lng: -75.7980 },
  { keys: ['OLAYA'], lat: 6.6269, lng: -75.8114 },
  { keys: ['LIBORINA'], lat: 6.6781, lng: -75.8119 },
  { keys: ['SABANALARGA'], lat: 6.8492, lng: -75.8181 },
  { keys: ['BURITICA'], lat: 6.7200, lng: -75.9069 },
  { keys: ['MANGLAR', 'EL MANGLAR'], lat: 6.6500, lng: -75.9200 },
  { keys: ['GIRALDO'], lat: 6.6806, lng: -75.9525 },
  { keys: ['PINGURO'], lat: 6.6950, lng: -75.9650 },
  { keys: ['TOYO', 'EL TOYO'], lat: 6.7150, lng: -75.9950 },
  { keys: ['CANASGORDAS', 'CAÑASGORDAS'], lat: 6.7497, lng: -76.0258 },
  { keys: ['FRONTINO'], lat: 6.7819, lng: -76.1319 },
  { keys: ['ABRIAQUI'], lat: 6.6322, lng: -76.0650 },
  { keys: ['JUNTAS DE URAMITA', 'JUNTAS'], lat: 6.8450, lng: -76.1350 },
  { keys: ['URAMITA'], lat: 6.8981, lng: -76.1669 },
  { keys: ['PEQUE'], lat: 7.0211, lng: -75.9089 },
  { keys: ['EL PITAL', 'PITAL'], lat: 6.9500, lng: -76.2200 },
  { keys: ['DABEIBA'], lat: 7.0003, lng: -76.2669 },
  { keys: ['CHIMIADO'], lat: 7.0800, lng: -76.3200 },
  { keys: ['TASIDO'], lat: 7.1500, lng: -76.3800 },
  { keys: ['MUTATA'], lat: 7.2439, lng: -76.4358 },
  { keys: ['PAVARANDOCITO', 'PAVARANDO'], lat: 7.2950, lng: -76.4650 },
  { keys: ['CAUCHERAS'], lat: 7.3650, lng: -76.5250 },
  { keys: ['BAJIRA', 'BELEN DE BAJIRA'], lat: 7.3850, lng: -76.6250 },
  { keys: ['BARRANQUILLITA'], lat: 7.4750, lng: -76.5850 },
  { keys: ['EL TIGRE', 'TIGRE'], lat: 7.5150, lng: -76.6150 },
  { keys: ['CHIGORODO'], lat: 7.6669, lng: -76.6808 },
  { keys: ['EL BOSQUE'], lat: 7.7100, lng: -76.6700 },
  { keys: ['CAREPA'], lat: 7.7581, lng: -76.6553 },
  { keys: ['PIEDRAS BLANCAS'], lat: 7.8100, lng: -76.6450 },
  { keys: ['ZUNGO'], lat: 7.8350, lng: -76.6400 },
  { keys: ['APARTADO'], lat: 7.8831, lng: -76.6258 },
  { keys: ['EL REPOSO', 'REPOSO'], lat: 7.9250, lng: -76.6300 },
  { keys: ['CURRULAO'], lat: 7.9850, lng: -76.6350 },
  { keys: ['RIOGRANDE', 'RIO GRANDE'], lat: 8.0200, lng: -76.6550 },
  { keys: ['NUEVA COLONIA'], lat: 8.0400, lng: -76.6750 },
  { keys: ['EL TRES', 'TRES'], lat: 8.0550, lng: -76.6650 },
  { keys: ['TURBO'], lat: 8.0928, lng: -76.7281 },
  { keys: ['EL DOS'], lat: 8.1350, lng: -76.7050 },
  { keys: ['PIEDRECITAS'], lat: 8.2050, lng: -76.7250 },
  { keys: ['EL TOTUMO', 'TOTUMO'], lat: 8.2850, lng: -76.7550 },
  { keys: ['BOBAL', 'EL BOBAL'], lat: 8.3500, lng: -76.7650 },
  { keys: ['NECOCLI'], lat: 8.4258, lng: -76.7836 },
  { keys: ['ZAPATA'], lat: 8.5150, lng: -76.7550 },
  { keys: ['MULATOS'], lat: 8.5550, lng: -76.6850 },
  { keys: ['DAMAQUIEL'], lat: 8.6850, lng: -76.5750 },
  { keys: ['SAN JUAN DE URABA', 'SAN JUAN'], lat: 8.7611, lng: -76.5289 },
  { keys: ['ARBOLETES'], lat: 8.8506, lng: -76.4269 },
  { keys: ['SAN PEDRO DE URABA', 'SAN PEDRO URABA'], lat: 8.2753, lng: -76.3767 },
  { keys: ['SANTA CATALINA'], lat: 8.3850, lng: -76.4050 },
  { keys: ['MELLITO', 'EL MELLITO'], lat: 8.3600, lng: -76.6500 },
  { keys: ['MONTERIA'], lat: 8.7558, lng: -75.8878 },
  { keys: ['TIERRALTA'], lat: 8.1719, lng: -76.0592 },
  { keys: ['VALENCIA'], lat: 8.2589, lng: -76.1469 },
  { keys: ['URRAO'], lat: 6.3156, lng: -76.1339 },
  { keys: ['CAICEDO'], lat: 6.4058, lng: -75.9831 },
  { keys: ['ANZA'], lat: 6.3033, lng: -75.8547 },
  { keys: ['GUINTAR'], lat: 6.2900, lng: -75.8800 },
  { keys: ['BETULIA'], lat: 6.1128, lng: -75.9856 },
  { keys: ['CONCORDIA'], lat: 6.0469, lng: -75.9081 },
  { keys: ['SALGAR'], lat: 5.9631, lng: -75.9731 },
  { keys: ['BOLOMBOLO'], lat: 5.9700, lng: -75.8400 },
  { keys: ['CIUDAD BOLIVAR'], lat: 5.8503, lng: -76.0211 },
  { keys: ['BELLO', 'NIQUIA'], lat: 6.3373, lng: -75.5579 },
  { keys: ['COPACABANA'], lat: 6.3464, lng: -75.5089 },
  { keys: ['GIRARDOTA'], lat: 6.3775, lng: -75.4481 },
  { keys: ['BARBOSA', 'EL HATILLO', 'HATILLO'], lat: 6.4381, lng: -75.3319 },
  { keys: ['DONMATIAS', 'DON MATIAS'], lat: 6.4858, lng: -75.3961 },
  { keys: ['SAN PEDRO DE LOS MILAGROS', 'SAN PEDRO'], lat: 6.4631, lng: -75.5569 },
  { keys: ['ENTRERRIOS', 'ENTRE RIOS'], lat: 6.5661, lng: -75.5150 },
  { keys: ['BELMIRA'], lat: 6.6053, lng: -75.6669 },
  { keys: ['SANTA ROSA DE OSOS', 'SANTA ROSA', 'STA ROSA', 'HOYO RICO'], lat: 6.6472, lng: -75.4603 },
  { keys: ['SAN JOSE DE LA MONTANA', 'SAN JOSE DE LA MONTAÑA', 'SAN JOSE'], lat: 6.8506, lng: -75.6819 },
  { keys: ['SAN ANDRES DE CUERQUIA', 'CUERQUIA', 'SAN ANDRES'], lat: 6.9158, lng: -75.6761 },
  { keys: ['EL VALLE', 'TOLEDO'], lat: 7.0089, lng: -75.6958 },
  { keys: ['PESCADERO'], lat: 7.0750, lng: -75.6950 },
  { keys: ['ITUANGO', 'HIDROITUANGO'], lat: 7.1711, lng: -75.7642 },
  { keys: ['YARUMAL'], lat: 6.9631, lng: -75.4172 },
  { keys: ['VALDIVIA', 'PUERTO VALDIVIA'], lat: 7.1636, lng: -75.4394 },
  { keys: ['TARAZA'], lat: 7.5836, lng: -75.4003 },
  { keys: ['CAUCASIA'], lat: 7.9869, lng: -75.1936 },
  { keys: ['RIONEGRO', 'AEROPUERTO'], lat: 6.1553, lng: -75.3736 },
  { keys: ['MARINILLA'], lat: 6.1736, lng: -75.3361 },
  { keys: ['GUARNE'], lat: 6.2803, lng: -75.4431 },
  { keys: ['MEDELLIN', 'MEDELLÍN'], lat: 6.2705, lng: -75.5721 }
];

function cleanStr(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function findCoordsByText(text) {
  const norm = cleanStr(text);
  if (!norm) return null;
  for (const entry of CHECKPOINT_COORDS) {
    for (const k of entry.keys) {
      if (norm.includes(k)) {
        return { lat: entry.lat, lng: entry.lng };
      }
    }
  }
  return null;
}

function msToClock(ms) {
  if (ms === null || ms === undefined || isNaN(ms)) return '--:--:--';
  const wrapped = ((Math.round(ms) % 86400000) + 86400000) % 86400000;
  const totalSec = Math.floor(wrapped / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function msToShortClock(ms) {
  if (ms === null || ms === undefined || isNaN(ms)) return '--:--';
  const wrapped = ((Math.round(ms) % 86400000) + 86400000) % 86400000;
  const totalSec = Math.floor(wrapped / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function ReplayMapController({ position, followBus, boundsPoints }) {
  const map = useMap();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!initializedRef.current && boundsPoints && boundsPoints.length >= 2) {
      try {
        const bounds = L.latLngBounds(boundsPoints);
        map.fitBounds(bounds, { padding: [45, 45], maxZoom: 14 });
        initializedRef.current = true;
      } catch (e) {
        // ignore bounds error
      }
    }
  }, [boundsPoints, map]);

  useEffect(() => {
    if (followBus && position) {
      map.panTo(position, { animate: true, duration: 0.35 });
    }
  }, [position, followBus, map]);

  return null;
}

export default function TripReplayPlayer({ trip, tripTelemetry }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(2); // 1x, 2x, 5x, 10x
  const [progressRatio, setProgressRatio] = useState(0); // 0..1
  const [followBus, setFollowBus] = useState(false);

  // Reset player when trip changes
  useEffect(() => {
    setIsPlaying(false);
    setProgressRatio(0);
  }, [trip?.viaje, trip?.fecha, trip?.interno]);

  // Build unified chronological route (Checkpoints + GPS Telemetry Points)
  const replayModel = useMemo(() => {
    if (!trip || !trip.puntos || trip.puntos.length === 0) return null;

    const rawCheckpoints = [...trip.puntos].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    const n = rawCheckpoints.length;

    // 1. Resolve monotonic timestamps for checkpoints
    let lastTimeMs = null;
    let dayOffsetMs = 0;
    const cpTimes = rawCheckpoints.map((cp, idx) => {
      const timeStr = cp.hora_real || cp.hora_est;
      let tMs = timeStr ? timeToMs(timeStr) : null;
      if (tMs !== null) {
        tMs += dayOffsetMs;
        if (lastTimeMs !== null && tMs < lastTimeMs - 1800000) {
          // Crossed midnight
          dayOffsetMs += 86400000;
          tMs += 86400000;
        }
        if (lastTimeMs !== null && tMs <= lastTimeMs) {
          tMs = lastTimeMs + 60000; // Ensure strictly increasing (+1 min)
        }
        lastTimeMs = tMs;
      }
      return tMs;
    });

    // Fill missing timestamps if any
    const firstValidIdx = cpTimes.findIndex(t => t !== null);
    if (firstValidIdx === -1) {
      // Fallback synthetic schedule starting at 06:00
      for (let i = 0; i < n; i++) cpTimes[i] = 6 * 3600000 + i * 15 * 60000;
    } else {
      for (let i = firstValidIdx - 1; i >= 0; i--) {
        cpTimes[i] = cpTimes[i + 1] - 10 * 60000;
      }
      for (let i = firstValidIdx + 1; i < n; i++) {
        if (cpTimes[i] === null) {
          let nextValid = i + 1;
          while (nextValid < n && cpTimes[nextValid] === null) nextValid++;
          if (nextValid < n) {
            const step = (cpTimes[nextValid] - cpTimes[i - 1]) / (nextValid - (i - 1));
            cpTimes[i] = cpTimes[i - 1] + step;
          } else {
            cpTimes[i] = cpTimes[i - 1] + 10 * 60000;
          }
        }
      }
    }

    // 2. Resolve cumulative distances
    const rawDists = rawCheckpoints.map(p => Number(p.distancia) || 0);
    const sumDists = rawDists.reduce((s, d) => s + d, 0);
    const totalTripDist = Number(trip.totalDistancia) || sumDists || 0;
    const isAlreadyCumulative =
      n > 1 &&
      rawDists[n - 1] >= totalTripDist * 0.85 &&
      sumDists > totalTripDist * 1.35;

    let runningDist = 0;
    const cpCumDist = rawDists.map((d, idx) => {
      if (isAlreadyCumulative) return d;
      runningDist += d;
      return Number(runningDist.toFixed(2));
    });
    const finalDist = Math.max(totalTripDist, cpCumDist[n - 1] || 0);

    // 3. Resolve coordinates for checkpoints
    const cpCoords = rawCheckpoints.map(cp => findCoordsByText(cp.puesto));

    // Try route name endpoints for first and last checkpoint if missing
    if (trip.ruta) {
      const routeParts = String(trip.ruta).split(/[-–—/]/).map(s => s.trim()).filter(Boolean);
      if (!cpCoords[0] && routeParts[0]) {
        cpCoords[0] = findCoordsByText(routeParts[0]);
      }
      if (!cpCoords[n - 1] && routeParts.length > 1) {
        cpCoords[n - 1] = findCoordsByText(routeParts[routeParts.length - 1]);
      }
    }

    // If still no coordinates matched at all, use GPS telemetry or default corridor
    const hasAnyCoord = cpCoords.some(Boolean);
    const gpsExcesos = (tripTelemetry?.crossReferenced ? tripTelemetry.excesos : []) || [];

    if (!hasAnyCoord) {
      if (gpsExcesos.length >= 2) {
        cpCoords[0] = { lat: gpsExcesos[0].lat, lng: gpsExcesos[0].lng };
        cpCoords[n - 1] = {
          lat: gpsExcesos[gpsExcesos.length - 1].lat,
          lng: gpsExcesos[gpsExcesos.length - 1].lng
        };
      } else if (gpsExcesos.length === 1) {
        cpCoords[0] = { lat: gpsExcesos[0].lat - 0.06, lng: gpsExcesos[0].lng + 0.04 };
        cpCoords[n - 1] = { lat: gpsExcesos[0].lat + 0.06, lng: gpsExcesos[0].lng - 0.04 };
      } else {
        // Default Medellín -> Urabá corridor
        cpCoords[0] = { lat: 6.2764, lng: -75.5708 };
        cpCoords[n - 1] = { lat: 7.8831, lng: -76.6258 };
      }
    }

    // Fill leading/trailing missing coords
    const firstCoordIdx = cpCoords.findIndex(Boolean);
    for (let i = firstCoordIdx - 1; i >= 0; i--) {
      cpCoords[i] = {
        lat: cpCoords[i + 1].lat - 0.015,
        lng: cpCoords[i + 1].lng + 0.015
      };
    }
    for (let i = firstCoordIdx + 1; i < n; i++) {
      if (!cpCoords[i]) {
        let nextKnown = i + 1;
        while (nextKnown < n && !cpCoords[nextKnown]) nextKnown++;
        if (nextKnown < n) {
          const ratio = (i - (i - 1)) / (nextKnown - (i - 1));
          cpCoords[i] = {
            lat: cpCoords[i - 1].lat + (cpCoords[nextKnown].lat - cpCoords[i - 1].lat) * ratio,
            lng: cpCoords[i - 1].lng + (cpCoords[nextKnown].lng - cpCoords[i - 1].lng) * ratio
          };
        } else {
          cpCoords[i] = {
            lat: cpCoords[i - 1].lat + 0.015,
            lng: cpCoords[i - 1].lng - 0.015
          };
        }
      }
    }

    // Build enriched checkpoints
    const checkpoints = rawCheckpoints.map((cp, idx) => {
      const prevTime = idx > 0 ? cpTimes[idx - 1] : cpTimes[0];
      const prevDist = idx > 0 ? cpCumDist[idx - 1] : 0;
      const dtHours = Math.max(0.05, (cpTimes[idx] - prevTime) / 3600000);
      const dKm = Math.max(0, cpCumDist[idx] - prevDist);
      const rawCruise = dKm > 0 ? Math.round(dKm / dtHours) : 52;
      const cruiseSpeed = Math.min(82, Math.max(28, rawCruise));

      return {
        ...cp,
        index: idx,
        timeMs: cpTimes[idx],
        cumDistKm: cpCumDist[idx],
        lat: cpCoords[idx].lat,
        lng: cpCoords[idx].lng,
        cruiseSpeed
      };
    });

    const startTimeMs = checkpoints[0].timeMs;
    const endTimeMs = Math.max(startTimeMs + 60000, checkpoints[n - 1].timeMs);
    const totalDurationMs = endTimeMs - startTimeMs;

    // 4. Integrate GPS Speeding Points within trip timeframe
    const gpsEvents = gpsExcesos
      .map((p, idx) => {
        let tMs = p.hora ? timeToMs(p.hora) : null;
        if (tMs !== null && tMs < startTimeMs - 1800000 && endTimeMs > 86400000) {
          tMs += 86400000;
        }
        const clampedMs =
          tMs !== null
            ? Math.min(endTimeMs, Math.max(startTimeMs, tMs))
            : startTimeMs + ((idx + 1) / (gpsExcesos.length + 1)) * totalDurationMs;
        return {
          ...p,
          id: `gps-${idx}`,
          timeMs: clampedMs,
          ratio: (clampedMs - startTimeMs) / totalDurationMs
        };
      })
      .sort((a, b) => a.timeMs - b.timeMs);

    // 5. Build combined path nodes (Checkpoints + GPS points) sorted by timeMs
    const nodes = [
      ...checkpoints.map(cp => ({
        type: 'checkpoint',
        timeMs: cp.timeMs,
        lat: cp.lat,
        lng: cp.lng,
        cumDistKm: cp.cumDistKm,
        diferencia: Number(cp.diferencia) || 0,
        cruiseSpeed: cp.cruiseSpeed,
        label: cp.puesto,
        cpIndex: cp.index
      })),
      ...gpsEvents.map(g => {
        // Interpolate cumulative distance and delay at this timestamp
        let cpBefore = checkpoints[0];
        let cpAfter = checkpoints[n - 1];
        for (let i = 0; i < n - 1; i++) {
          if (g.timeMs >= checkpoints[i].timeMs && g.timeMs <= checkpoints[i + 1].timeMs) {
            cpBefore = checkpoints[i];
            cpAfter = checkpoints[i + 1];
            break;
          }
        }
        const segDur = Math.max(1, cpAfter.timeMs - cpBefore.timeMs);
        const segRatio = Math.min(1, Math.max(0, (g.timeMs - cpBefore.timeMs) / segDur));
        return {
          type: 'gps',
          timeMs: g.timeMs,
          lat: g.lat,
          lng: g.lng,
          cumDistKm: cpBefore.cumDistKm + (cpAfter.cumDistKm - cpBefore.cumDistKm) * segRatio,
          diferencia: Math.round(
            (Number(cpBefore.diferencia) || 0) +
              ((Number(cpAfter.diferencia) || 0) - (Number(cpBefore.diferencia) || 0)) * segRatio
          ),
          cruiseSpeed: g.velocidad,
          velocidadGps: g.velocidad,
          label: `Exceso GPS (${g.velocidad} km/h)`,
          hora: g.hora
        };
      })
    ].sort((a, b) => a.timeMs - b.timeMs);

    return {
      checkpoints,
      gpsEvents,
      nodes,
      startTimeMs,
      endTimeMs,
      totalDurationMs,
      finalDist
    };
  }, [trip, tripTelemetry]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || !replayModel) return;

    const tickMs = 50;
    // At 1x speed, full trip takes ~40 seconds
    const baseStepRatio = tickMs / 40000;

    const interval = setInterval(() => {
      setProgressRatio(prev => {
        const next = prev + baseStepRatio * speedMultiplier;
        if (next >= 1) {
          setIsPlaying(false);
          return 1;
        }
        return next;
      });
    }, tickMs);

    return () => clearInterval(interval);
  }, [isPlaying, speedMultiplier, replayModel]);

  // Compute live bus state at current progressRatio
  const liveState = useMemo(() => {
    if (!replayModel) return null;
    const { checkpoints, gpsEvents, nodes, startTimeMs, totalDurationMs, finalDist } = replayModel;
    const currentTimeMs = startTimeMs + progressRatio * totalDurationMs;

    // Find surrounding nodes for smooth position interpolation
    let nodeA = nodes[0];
    let nodeB = nodes[nodes.length - 1];
    for (let i = 0; i < nodes.length - 1; i++) {
      if (currentTimeMs >= nodes[i].timeMs && currentTimeMs <= nodes[i + 1].timeMs) {
        nodeA = nodes[i];
        nodeB = nodes[i + 1];
        break;
      }
    }

    const segDuration = Math.max(1, nodeB.timeMs - nodeA.timeMs);
    const localT = Math.min(1, Math.max(0, (currentTimeMs - nodeA.timeMs) / segDuration));

    const lat = nodeA.lat + (nodeB.lat - nodeA.lat) * localT;
    const lng = nodeA.lng + (nodeB.lng - nodeA.lng) * localT;
    const currentKm = nodeA.cumDistKm + (nodeB.cumDistKm - nodeA.cumDistKm) * localT;
    const currentDiff = Math.round(nodeA.diferencia + (nodeB.diferencia - nodeA.diferencia) * localT);

    // Determine last passed checkpoint and next checkpoint
    let currentCpIndex = 0;
    for (let i = 0; i < checkpoints.length; i++) {
      if (currentTimeMs >= checkpoints[i].timeMs) {
        currentCpIndex = i;
      } else {
        break;
      }
    }
    const currentCp = checkpoints[currentCpIndex];
    const nextCp = checkpoints[Math.min(checkpoints.length - 1, currentCpIndex + 1)];

    // Check if near a GPS speeding event (within 1.8% of timeline)
    const activeGpsAlert = gpsEvents.find(
      g => Math.abs(g.timeMs - currentTimeMs) <= Math.max(90000, totalDurationMs * 0.018)
    );

    let liveSpeed = nextCp.cruiseSpeed || 55;
    if (progressRatio <= 0.001 || progressRatio >= 0.999) {
      liveSpeed = 0;
    } else if (activeGpsAlert) {
      liveSpeed = activeGpsAlert.velocidad;
    }

    // Build traveled polyline up to current position
    const traveledCoords = nodes
      .filter(n => n.timeMs <= currentTimeMs)
      .map(n => [n.lat, n.lng]);
    traveledCoords.push([lat, lng]);

    return {
      currentTimeMs,
      lat,
      lng,
      currentKm: Math.min(finalDist, Math.max(0, currentKm)),
      currentDiff,
      currentCpIndex,
      currentCp,
      nextCp,
      liveSpeed,
      activeGpsAlert,
      traveledCoords
    };
  }, [replayModel, progressRatio]);

  if (!replayModel || !liveState) return null;

  const { checkpoints, gpsEvents, nodes, startTimeMs, endTimeMs, totalDurationMs, finalDist } = replayModel;
  const fullRouteCoords = nodes.map(n => [n.lat, n.lng]);
  const conductorActual =
    liveState.currentCp?.conductor ||
    trip.conductoresArray?.[0] ||
    'SIN CONDUCTOR';

  const isSpeedingNow = liveState.liveSpeed > SPEED_LIMIT_KMH;

  // Custom animated bus DivIcon
  const busIcon = L.divIcon({
    className: 'custom-bus-replay-icon',
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);">
        <div style="padding:2px 7px;border-radius:9999px;font-family:'Outfit',sans-serif;font-size:10px;font-weight:900;white-space:nowrap;margin-bottom:4px;background:${
          isSpeedingNow ? '#e11d48' : '#0f172a'
        };color:#ffffff;border:1.5px solid ${
          isSpeedingNow ? '#fda4af' : '#38bdf8'
        };box-shadow:0 4px 12px rgba(0,0,0,0.45);">
          #${trip.interno} · ${liveState.liveSpeed} km/h
        </div>
        <div style="width:34px;height:34px;border-radius:9999px;background:${
          isSpeedingNow
            ? 'linear-gradient(135deg,#f43f5e,#be123c)'
            : 'linear-gradient(135deg,#06b6d4,#3b82f6)'
        };display:flex;align-items:center;justify-content:center;border:2.5px solid #ffffff;box-shadow:0 0 20px ${
          isSpeedingNow ? 'rgba(244,63,94,0.85)' : 'rgba(6,182,212,0.8)'
        };">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="3" width="16" height="15" rx="3"></rect>
            <path d="M4 11h16"></path>
            <path d="M8 15h.01"></path>
            <path d="M16 15h.01"></path>
            <path d="M6 18v2"></path>
            <path d="M18 18v2"></path>
          </svg>
        </div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  });

  const jumpToCheckpoint = (cpIdx) => {
    const target = checkpoints[cpIdx];
    if (!target) return;
    const ratio = (target.timeMs - startTimeMs) / totalDurationMs;
    setProgressRatio(Math.min(1, Math.max(0, ratio)));
  };

  const handlePlayPause = () => {
    if (progressRatio >= 0.999) {
      setProgressRatio(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(prev => !prev);
    }
  };

  return (
    <div className="glass-panel p-6 md:p-8 rounded-[2.5rem] relative overflow-hidden border border-cyan-500/20 shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
      <div className="absolute top-0 left-10 w-32 h-1.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 rounded-b-xl opacity-90"></div>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 mb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.9)] animate-pulse"></span>
            <h3 className="text-2xl font-extrabold text-slate-100 tracking-tight">
              Reproductor Interactivo del Viaje
            </h3>
            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-400/30">
              Replay GPS vs. Reloj
            </span>
          </div>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Simulación cronológica de puestos de control y alertas GPS · Conductor: <strong className="text-slate-200">{conductorActual}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {gpsEvents.length > 0 ? (
            <div className="px-3.5 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-extrabold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping"></span>
              {gpsEvents.length} Exceso(s) GPS en ruta (&gt; {SPEED_LIMIT_KMH} km/h)
            </div>
          ) : (
            <div className="px-3.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-extrabold flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
              0 Excesos de velocidad en este viaje
            </div>
          )}

          <button
            type="button"
            onClick={() => setFollowBus(prev => !prev)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold border transition-all flex items-center gap-1.5 ${
              followBus
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.25)]'
                : 'bg-slate-800/60 border-white/10 text-slate-400 hover:text-slate-200'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            {followBus ? 'Cámara siguiendo bus' : 'Seguir bus'}
          </button>
        </div>
      </div>

      {/* Live HUD Gauges */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        {/* Reloj del Viaje */}
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reloj del Viaje</span>
            <span className="text-[10px] font-bold text-cyan-400">{Math.round(progressRatio * 100)}%</span>
          </div>
          <p className="text-2xl md:text-3xl font-black text-white font-mono tracking-tight mt-1">
            {msToClock(liveState.currentTimeMs)}
          </p>
          <p className="text-[11px] text-slate-400 font-semibold mt-1">
            Salida {msToShortClock(startTimeMs)} → Fin {msToShortClock(endTimeMs)}
          </p>
        </div>

        {/* Velocímetro en Vivo */}
        <div
          className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
            isSpeedingNow
              ? 'bg-rose-950/60 border-rose-500/60 shadow-[0_0_25px_rgba(244,63,94,0.3)]'
              : 'bg-slate-900/60 border-white/10'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Velocidad</span>
            {isSpeedingNow ? (
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-rose-500 text-white animate-pulse">
                ¡EXCESO GPS!
              </span>
            ) : (
              <span className="text-[10px] font-bold text-emerald-400">Normal (&le; {SPEED_LIMIT_KMH})</span>
            )}
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className={`text-2xl md:text-3xl font-black ${isSpeedingNow ? 'text-rose-400' : 'text-cyan-300'}`}>
              {liveState.liveSpeed}
            </span>
            <span className="text-xs font-bold text-slate-400">km/h</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2">
            <div
              className={`h-full transition-all duration-200 ${
                isSpeedingNow ? 'bg-rose-500' : 'bg-gradient-to-r from-cyan-400 to-emerald-400'
              }`}
              style={{ width: `${Math.min(100, (liveState.liveSpeed / 115) * 100)}%` }}
            />
          </div>
        </div>

        {/* Puesto de Control Actual / Siguiente */}
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tramo en Curso</span>
            <span className="text-[10px] font-bold text-indigo-300">
              Puesto {liveState.currentCpIndex + 1} de {checkpoints.length}
            </span>
          </div>
          <p className="text-sm md:text-base font-extrabold text-white truncate mt-1" title={liveState.currentCp?.puesto}>
            {liveState.currentCp?.puesto || '-'}
          </p>
          <p className="text-[11px] text-slate-400 font-semibold truncate mt-1" title={liveState.nextCp?.puesto}>
            Próx: <span className="text-cyan-300">{liveState.nextCp?.puesto || 'Destino final'}</span>
          </p>
        </div>

        {/* Estado de Puntualidad y Distancia */}
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Estado vs. Horario</span>
            <span className="text-[10px] font-bold text-slate-300">
              {liveState.currentKm.toFixed(1)} / {finalDist.toFixed(1)} km
            </span>
          </div>
          <div className="mt-1">
            {liveState.currentDiff > PUNCTUALITY_TOLERANCE_MIN ? (
              <span className="text-xl md:text-2xl font-black text-rose-400">
                +{liveState.currentDiff} min (Tarde)
              </span>
            ) : liveState.currentDiff < -PUNCTUALITY_TOLERANCE_MIN ? (
              <span className="text-xl md:text-2xl font-black text-emerald-400">
                {liveState.currentDiff} min (Antes)
              </span>
            ) : (
              <span className="text-xl md:text-2xl font-black text-cyan-300">
                A Tiempo ({liveState.currentDiff > 0 ? `+${liveState.currentDiff}` : liveState.currentDiff} min)
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 font-semibold mt-1">
            Prog: {liveState.currentCp?.hora_est || '--:--'} · Real: {liveState.currentCp?.hora_real || '--:--'}
          </p>
        </div>
      </div>

      {/* Interactive Map */}
      <div className="h-[390px] w-full rounded-3xl overflow-hidden border border-white/15 relative z-0 shadow-inner">
        <MapContainer
          key={`replay-${trip.viaje}-${trip.interno}-${trip.fecha}`}
          center={[liveState.lat, liveState.lng]}
          zoom={10}
          style={{ height: '100%', width: '100%' }}
        >
          <ReplayMapController
            position={[liveState.lat, liveState.lng]}
            followBus={followBus}
            boundsPoints={fullRouteCoords}
          />
          <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />

          {/* Ruta Base */}
          <Polyline
            positions={fullRouteCoords}
            pathOptions={{ color: '#475569', weight: 4, opacity: 0.55, dashArray: '6, 8' }}
          />

          {/* Ruta Recorrida */}
          {liveState.traveledCoords.length >= 2 && (
            <Polyline
              positions={liveState.traveledCoords}
              pathOptions={{ color: '#06b6d4', weight: 5, opacity: 0.95 }}
            />
          )}

          {/* Marcadores de Puestos de Control */}
          {checkpoints.map((cp, idx) => {
            const passed = liveState.currentTimeMs >= cp.timeMs;
            const diff = Number(cp.diferencia) || 0;
            const color =
              diff > PUNCTUALITY_TOLERANCE_MIN
                ? '#f43f5e'
                : diff < -PUNCTUALITY_TOLERANCE_MIN
                ? '#10b981'
                : '#38bdf8';

            return (
              <CircleMarker
                key={`cp-${idx}`}
                center={[cp.lat, cp.lng]}
                radius={passed ? 7 : 5}
                pathOptions={{
                  color: passed ? '#ffffff' : color,
                  fillColor: color,
                  fillOpacity: passed ? 0.95 : 0.45,
                  weight: passed ? 2 : 1.5
                }}
                eventHandlers={{
                  click: () => jumpToCheckpoint(idx)
                }}
              >
                <Popup className="font-sans">
                  <div className="text-xs space-y-1">
                    <p className="font-black text-slate-900">
                      #{cp.orden} · {cp.puesto}
                    </p>
                    <p className="text-slate-600">
                      Prog: <strong>{cp.hora_est || '-'}</strong> | Real: <strong>{cp.hora_real || '-'}</strong>
                    </p>
                    <p className={diff > PUNCTUALITY_TOLERANCE_MIN ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>
                      Diferencia: {diff > 0 ? `+${diff}` : diff} min
                    </p>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

          {/* Marcadores de Excesos de Velocidad GPS */}
          {gpsEvents.map((g, idx) => (
            <CircleMarker
              key={`gps-marker-${idx}`}
              center={[g.lat, g.lng]}
              radius={8}
              pathOptions={{
                color: '#ffffff',
                fillColor: '#e11d48',
                fillOpacity: 0.95,
                weight: 2
              }}
              eventHandlers={{
                click: () => setProgressRatio(g.ratio)
              }}
            >
              <Popup className="font-sans">
                <div className="text-center text-xs">
                  <p className="text-rose-600 font-black text-base">{g.velocidad} km/h</p>
                  <p className="text-slate-600 font-bold">Exceso GPS · {g.hora}</p>
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {/* Marcador Animado del Bus */}
          <Marker position={[liveState.lat, liveState.lng]} icon={busIcon} />
        </MapContainer>
      </div>

      {/* Player Controls + Timeline Scrubber */}
      <div className="mt-6 space-y-4">
        {/* Scrubber con Puestos y Alertas */}
        <div className="relative pt-2 pb-1">
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(progressRatio * 1000)}
            onChange={e => {
              setIsPlaying(false);
              setProgressRatio(Number(e.target.value) / 1000);
            }}
            className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 relative z-20"
            aria-label="Línea de tiempo del viaje"
          />

          {/* Marcas de Excesos GPS sobre la barra */}
          <div className="relative h-3 mt-1">
            {gpsEvents.map(g => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setProgressRatio(g.ratio);
                }}
                style={{ left: `${Math.min(99, Math.max(1, g.ratio * 100))}%` }}
                className="absolute -top-1 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-rose-500 border border-white shadow-[0_0_8px_rgba(244,63,94,0.9)] hover:scale-150 transition-transform"
                title={`Saltar a exceso GPS: ${g.velocidad} km/h (${g.hora})`}
              />
            ))}
          </div>
        </div>

        {/* Botonera Principal y Selector de Velocidad */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {/* Play / Pause */}
            <button
              type="button"
              onClick={handlePlayPause}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-extrabold text-sm flex items-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all active:scale-95"
            >
              {isPlaying ? (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                  Pausar
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  {progressRatio >= 0.999 ? 'Repetir Viaje' : 'Reproducir'}
                </>
              )}
            </button>

            {/* Reiniciar */}
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setProgressRatio(0);
              }}
              className="p-2.5 rounded-xl bg-slate-800/70 hover:bg-slate-700 text-slate-300 border border-white/10 transition-colors"
              title="Reiniciar al inicio del viaje"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>

            {/* Puesto Anterior */}
            <button
              type="button"
              onClick={() => jumpToCheckpoint(Math.max(0, liveState.currentCpIndex - 1))}
              className="px-3 py-2 rounded-xl bg-slate-800/70 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-white/10 transition-colors"
              title="Puesto de control anterior"
            >
              ⏮ Anterior
            </button>

            {/* Siguiente Puesto */}
            <button
              type="button"
              onClick={() => jumpToCheckpoint(Math.min(checkpoints.length - 1, liveState.currentCpIndex + 1))}
              className="px-3 py-2 rounded-xl bg-slate-800/70 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-white/10 transition-colors"
              title="Siguiente puesto de control"
            >
              Siguiente ⏭
            </button>
          </div>

          {/* Velocidad de Reproducción */}
          <div className="flex items-center gap-1.5 bg-slate-900/70 p-1.5 rounded-2xl border border-white/10">
            <span className="text-[11px] font-bold text-slate-400 px-2">Velocidad:</span>
            {[1, 2, 5, 10].map(mult => (
              <button
                key={mult}
                type="button"
                onClick={() => setSpeedMultiplier(mult)}
                className={`px-3 py-1 rounded-xl text-xs font-extrabold transition-all ${
                  speedMultiplier === mult
                    ? 'bg-cyan-500 text-white shadow-[0_0_10px_rgba(6,182,212,0.5)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {mult}x
              </button>
            ))}
          </div>
        </div>

        {/* Estaciones / Puestos de Control Clickables */}
        <div className="pt-3 border-t border-white/10 flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
          {checkpoints.map((cp, idx) => {
            const isCurrent = idx === liveState.currentCpIndex;
            const isPassed = idx < liveState.currentCpIndex;
            const diff = Number(cp.diferencia) || 0;
            return (
              <button
                key={`pill-${idx}`}
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  jumpToCheckpoint(idx);
                }}
                className={`shrink-0 px-3 py-2 rounded-xl border text-left transition-all ${
                  isCurrent
                    ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-[0_0_15px_rgba(6,182,212,0.25)]'
                    : isPassed
                    ? 'bg-slate-800/70 border-white/15 text-slate-200'
                    : 'bg-slate-900/40 border-white/5 text-slate-400 hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      diff > PUNCTUALITY_TOLERANCE_MIN
                        ? 'bg-rose-400'
                        : diff < -PUNCTUALITY_TOLERANCE_MIN
                        ? 'bg-emerald-400'
                        : 'bg-cyan-400'
                    }`}
                  />
                  <span className="text-[11px] font-extrabold truncate max-w-[130px]">{cp.puesto}</span>
                </div>
                <div className="text-[10px] text-slate-400 font-semibold mt-0.5 flex items-center justify-between gap-2">
                  <span>{cp.hora_real || cp.hora_est || '--:--'}</span>
                  <span
                    className={
                      diff > PUNCTUALITY_TOLERANCE_MIN
                        ? 'text-rose-400 font-bold'
                        : diff < -PUNCTUALITY_TOLERANCE_MIN
                        ? 'text-emerald-400 font-bold'
                        : 'text-slate-400'
                    }
                  >
                    {diff > 0 ? `+${diff}m` : `${diff}m`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
