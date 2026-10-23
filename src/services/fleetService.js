import { collection, doc, writeBatch, getDoc, getDocs, query, where, setDoc, addDoc, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase.js';
import { tripToDoc, telemetryToDocs, sanitizeId, docToTrip, docToTelemetry, toISOFormat } from './mappers.js';

const BATCH_SIZE = 400; // Firestore limit is 500

/**
 * Helper to execute batches
 */
async function executeInBatches(items, processItemFn, onProgress) {
  let batch = writeBatch(db);
  let count = 0;
  let totalProcessed = 0;
  
  for (const item of items) {
    await processItemFn(batch, item);
    count++;
    totalProcessed++;
    
    if (count >= BATCH_SIZE) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
      if (onProgress) onProgress(totalProcessed, items.length);
    }
  }
  
  if (count > 0) {
    await batch.commit();
    if (onProgress) onProgress(totalProcessed, items.length);
  }
}

/**
 * Campos de auditoría: quién subió el dato
 */
function uploaderFields(uploader) {
  return {
    subidoPor: uploader?.email || null,
    subidoPorUid: uploader?.uid || null
  };
}

/**
 * Registra en la colección 'cargas' un log por cada archivo cargado a la nube.
 */
export async function logUpload(uploader, { tipo, archivo, registros, fechasDatos }) {
  try {
    await addDoc(collection(db, 'cargas'), {
      tipo,
      archivo: archivo || null,
      registros: registros || 0,
      fechasDatos: fechasDatos || null,
      usuario: uploader?.email || null,
      uid: uploader?.uid || null,
      fecha: new Date()
    });
  } catch (err) {
    console.warn('No se pudo registrar la subida:', err);
  }
}

/**
 * Normaliza cualquier variante de texto del rol a: 'admin' | 'operador' | 'visor'
 */
function normalizeRoleValue(raw) {
  if (!raw) return null;
  const val = String(raw).trim().toLowerCase();
  if (['admin', 'administrador', 'administradora', 'superadmin'].includes(val)) return 'admin';
  if (['operador', 'operadora', 'operario', 'operaciones', 'operativo'].includes(val)) return 'operador';
  if (['visor', 'lectura', 'consulta', 'invitado', 'viewer'].includes(val)) return 'visor';
  return null;
}

/**
 * Extrae el rol desde un documento de Firestore tolerando mayúsculas/minúsculas en el nombre del campo y en el valor.
 */
function extractRoleFromDocData(data) {
  if (!data || typeof data !== 'object') return null;
  const raw =
    data.rol ??
    data.Rol ??
    data.ROL ??
    data.role ??
    data.Role ??
    data.perfil ??
    data.Perfil ??
    data.cargo ??
    data.Cargo;
  return normalizeRoleValue(raw);
}

/**
 * Obtiene el rol del usuario desde la colección 'usuarios'.
 * Soporta:
 *  1) Documento con ID = uid (usuarios/{uid})
 *  2) Documento con ID = email (usuarios/{email})
 *  3) Documento con ID automático que tenga campo email / correo / uid coincidente
 * Sin rol asignado => 'visor'.
 */
export async function fetchUserRole(uid, email) {
  const emailClean = email ? String(email).trim() : '';
  const emailLower = emailClean.toLowerCase();

  if (emailLower === 'sistemas@sotrauraba.com.co') return 'admin';

  // 1. Buscar por ID = uid
  if (uid) {
    try {
      const snapByUid = await getDoc(doc(db, 'usuarios', uid));
      if (snapByUid.exists()) {
        const parsed = extractRoleFromDocData(snapByUid.data());
        if (parsed) return parsed;
      }
    } catch (err) {
      console.warn('Intento de lectura usuarios/{uid} falló:', err);
    }
  }

  // 2. Buscar por ID = email (minúsculas o tal cual)
  if (emailClean) {
    const emailCandidates = Array.from(new Set([emailLower, emailClean]));
    for (const candidateId of emailCandidates) {
      try {
        const snapByEmail = await getDoc(doc(db, 'usuarios', candidateId));
        if (snapByEmail.exists()) {
          const parsed = extractRoleFromDocData(snapByEmail.data());
          if (parsed) return parsed;
        }
      } catch (err) {
        // continuar con el siguiente método
      }
    }
  }

  // 3. Buscar en la colección 'usuarios' por campo email / correo / uid
  try {
    const allUsersSnap = await getDocs(collection(db, 'usuarios'));
    for (const docSnap of allUsersSnap.docs) {
      const data = docSnap.data() || {};
      const docEmail = String(data.email ?? data.Email ?? data.correo ?? data.Correo ?? data.usuario ?? '').trim().toLowerCase();
      const docUid = String(data.uid ?? data.UID ?? data.id ?? '').trim();
      const idLower = docSnap.id.trim().toLowerCase();

      if (
        (uid && (docSnap.id === uid || docUid === uid)) ||
        (emailLower && (idLower === emailLower || docEmail === emailLower))
      ) {
        const parsed = extractRoleFromDocData(data);
        if (parsed) return parsed;
      }
    }
  } catch (err) {
    console.warn('No se pudo listar colección usuarios para buscar rol:', err);
  }

  return 'visor';
}

/**
 * Upsert Trips
 */
export async function upsertTrips(trips, onProgress, uploader) {
  const collectionRef = collection(db, 'viajes');
  const resumenRef = collection(db, 'resumen_diario');
  const uniqueDates = new Set();
  const planillaDates = new Set();
  
  await executeInBatches(trips, async (batch, trip) => {
    const docData = tripToDoc(trip);
    if (!docData.id) return;
    const docRef = doc(collectionRef, docData.id);
    
    if (docData.fechaISO) {
      uniqueDates.add(docData.fechaISO);
      if (trip.planilla && trip.planilla.conductor) {
        planillaDates.add(docData.fechaISO);
      }
    }
    
    batch.set(docRef, {
      ...docData,
      ...uploaderFields(uploader),
      actualizadoEn: new Date()
    }, { merge: true });
  }, onProgress);

  // Write summary dates
  if (uniqueDates.size > 0) {
    const summaryBatch = writeBatch(db);
    uniqueDates.forEach(date => {
      const payload = {
        fechaISO: date,
        tieneViajes: true,
        actualizadoEn: new Date()
      };
      if (planillaDates.has(date)) payload.tienePlanillas = true;
      summaryBatch.set(doc(resumenRef, date), payload, { merge: true });
    });
    await summaryBatch.commit();
  }
}

/**
 * Upsert Planillas
 * planillasMap is a Map<viajeId, conductor>
 */
export async function upsertPlanillas(planillasMap, onProgress, uploader, allTrips = []) {
  const collectionRef = collection(db, 'viajes');
  const resumenRef = collection(db, 'resumen_diario');
  const entries = Array.from(planillasMap.entries());
  const uniqueDates = new Set();

  // Discover dates from in-memory trips first
  if (allTrips && allTrips.length > 0) {
    allTrips.forEach(t => {
      const id = String(t.viaje ?? '').trim();
      if (planillasMap.has(id)) {
        const iso = toISOFormat(t.fecha);
        if (iso) uniqueDates.add(iso);
      }
    });
  }
  
  await executeInBatches(entries, async (batch, [viaje, conductor]) => {
    const safeId = sanitizeId(viaje);
    if (!safeId) return;
    const docRef = doc(collectionRef, safeId);
    
    // We only update the 'planilla' field, or create a skeleton if trip doesn't exist yet
    batch.set(docRef, {
      planilla: { conductor },
      planillaSubidaPor: uploader?.email || null,
      planillaSubidaPorUid: uploader?.uid || null,
      actualizadoEn: new Date()
    }, { merge: true });
  }, onProgress);

  // If no trips were in memory, sample a few docs from Firestore to find their fechaISO
  if (uniqueDates.size === 0 && entries.length > 0) {
    const sampleSize = Math.min(12, entries.length);
    const step = Math.max(1, Math.floor(entries.length / sampleSize));
    for (let i = 0; i < entries.length; i += step) {
      const safeId = sanitizeId(entries[i][0]);
      if (!safeId) continue;
      try {
        const snap = await getDoc(doc(collectionRef, safeId));
        if (snap.exists() && snap.data().fechaISO) {
          uniqueDates.add(snap.data().fechaISO);
        }
      } catch (e) {
        // ignore individual read failure
      }
    }
  }

  if (uniqueDates.size > 0) {
    try {
      const summaryBatch = writeBatch(db);
      uniqueDates.forEach(date => {
        summaryBatch.set(doc(resumenRef, date), {
          fechaISO: date,
          tienePlanillas: true,
          actualizadoEn: new Date()
        }, { merge: true });
      });
      await summaryBatch.commit();
    } catch (err) {
      console.warn('No se pudo actualizar resumen_diario para planillas:', err);
    }
  }
}

/**
 * Upsert Telemetry (merge points if doc already exists)
 */
export async function upsertTelemetry(telemetryVehicles, onProgress, uploader) {
  const collectionRef = collection(db, 'telemetria');
  const resumenRef = collection(db, 'resumen_diario');
  const uniqueDates = new Set();
  
  // We can't purely batch write if we need to read first to merge.
  // For telemetry, we will do sequential read-then-write.
  let totalProcessed = 0;
  
  for (const veh of telemetryVehicles) {
    const docsPorDia = telemetryToDocs(veh);

    for (const newDoc of docsPorDia) {
      if (newDoc.fechaISO) uniqueDates.add(newDoc.fechaISO);
      const docRef = doc(collectionRef, newDoc.id);
      
      try {
        const existingSnap = await getDoc(docRef);
        if (existingSnap.exists()) {
          const existingData = existingSnap.data();
          
          // Merge points
          const combinedPt = [...(existingData.pt || []), ...newDoc.pt];
          
          // Sort by time (h)
          combinedPt.sort((a, b) => String(a.h).localeCompare(String(b.h)));
          
          // Simple deduplication by time + lat
          const uniquePt = [];
          const seen = new Set();
          for (const p of combinedPt) {
            const key = `${p.h}_${p.la}`;
            if (!seen.has(key)) {
              seen.add(key);
              uniquePt.push(p);
            }
          }
          
          // Recalculate excesses
          const totalExcesos = uniquePt.filter(p => p.x === 1).length;
          
          await setDoc(docRef, {
            ...newDoc,
            ...uploaderFields(uploader),
            pt: uniquePt,
            totalExcesos
          }, { merge: true });
          
        } else {
          await setDoc(docRef, { ...newDoc, ...uploaderFields(uploader) });
        }
      } catch (err) {
        console.warn("Failed merging telemetry for", newDoc.id, err);
      }
    }
    
    totalProcessed++;
    if (onProgress) onProgress(totalProcessed, telemetryVehicles.length);
  }

  // Register dates for the calendar
  if (uniqueDates.size > 0) {
    const summaryBatch = writeBatch(db);
    uniqueDates.forEach(date => {
      summaryBatch.set(doc(resumenRef, date), {
        fechaISO: date,
        tieneTelemetria: true,
        actualizadoEn: new Date()
      }, { merge: true });
    });
    await summaryBatch.commit();
  }
}

/**
 * Fetch Trips by Date Range
 */
export async function fetchHistoricalTrips(startISO, endISO) {
  const collectionRef = collection(db, 'viajes');
  const q = query(
    collectionRef,
    where('fechaISO', '>=', startISO),
    where('fechaISO', '<=', endISO)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => docToTrip(docSnap.data()));
}

/**
 * Fetch Telemetry by Date Range
 */
export async function fetchHistoricalTelemetry(startISO, endISO) {
  const collectionRef = collection(db, 'telemetria');
  const q = query(
    collectionRef,
    where('fechaISO', '>=', startISO),
    where('fechaISO', '<=', endISO)
  );
  const snapshot = await getDocs(q);

  // Each doc is one vehicle-day. Merge them into one entry per vehicle
  // (each point keeps its own 'fecha', so the date filter works correctly).
  const byVehicle = new Map();
  snapshot.docs.forEach(docSnap => {
    const veh = docToTelemetry(docSnap.data());
    if (!byVehicle.has(veh.interno)) {
      byVehicle.set(veh.interno, { ...veh, puntos: [...veh.puntos] });
    } else {
      const acc = byVehicle.get(veh.interno);
      acc.puntos.push(...veh.puntos);
      acc.excesos = (acc.excesos || 0) + (veh.excesos || 0);
    }
  });

  return Array.from(byVehicle.values()).map(v => ({
    ...v,
    puntos: v.puntos.map((p, index) => ({ ...p, index }))
  }));
}

/**
 * Delete data by exact date
 */
export async function deleteCloudDataByDate(dateISO) {
  const batchArray = [writeBatch(db)];
  let opCount = 0;
  let bIdx = 0;

  const pushDelete = (ref) => {
    batchArray[bIdx].delete(ref);
    opCount++;
    if (opCount >= BATCH_SIZE) {
      batchArray.push(writeBatch(db));
      bIdx++;
      opCount = 0;
    }
  };

  const qViajes = query(collection(db, 'viajes'), where('fechaISO', '==', dateISO));
  const snapViajes = await getDocs(qViajes);
  snapViajes.docs.forEach(d => pushDelete(d.ref));

  const qTelem = query(collection(db, 'telemetria'), where('fechaISO', '==', dateISO));
  const snapTelem = await getDocs(qTelem);
  snapTelem.docs.forEach(d => pushDelete(d.ref));

  // Remove the calendar marker for this date
  pushDelete(doc(db, 'resumen_diario', dateISO));

  for (const b of batchArray) {
    await b.commit();
  }
}

/**
 * Fetch list of dates that have data available
 */
export async function fetchAvailableDates() {
  const collectionRef = collection(db, 'resumen_diario');
  const snapshot = await getDocs(collectionRef);
  return snapshot.docs.map(doc => doc.id);
}

/**
 * Obtiene el mapa completo de cobertura diaria en la nube desde 'resumen_diario'.
 */
export async function fetchCloudCoverage() {
  const collectionRef = collection(db, 'resumen_diario');
  const snapshot = await getDocs(collectionRef);
  const coverage = {};
  snapshot.docs.forEach(docSnap => {
    const data = docSnap.data() || {};
    const id = docSnap.id;
    coverage[id] = {
      fechaISO: id,
      tieneViajes: Boolean(data.tieneViajes),
      tienePlanillas: Boolean(data.tienePlanillas),
      tieneTelemetria: Boolean(data.tieneTelemetria),
      viajesCount: data.viajesCount ?? null,
      planillasCount: data.planillasCount ?? null,
      excesosCount: data.excesosCount ?? null,
      actualizadoEn: data.actualizadoEn?.toDate ? data.actualizadoEn.toDate() : null
    };
  });
  return coverage;
}

/**
 * Inspecciona en detalle un mes (YYYY-MM) consultando las colecciones 'viajes' y 'telemetria'
 * para verificar exactamente qué días tienen Tareas, Planillas y GPS, y actualiza resumen_diario si puede.
 */
export async function inspectMonthCoverage(yearMonth, canPersist = false) {
  const startISO = `${yearMonth}-01`;
  const endISO = `${yearMonth}-31`;
  const byDate = {};

  const ensureDate = (iso) => {
    if (!byDate[iso]) {
      byDate[iso] = {
        fechaISO: iso,
        tieneViajes: false,
        tienePlanillas: false,
        tieneTelemetria: false,
        viajesCount: 0,
        planillasCount: 0,
        excesosCount: 0
      };
    }
    return byDate[iso];
  };

  const qViajes = query(
    collection(db, 'viajes'),
    where('fechaISO', '>=', startISO),
    where('fechaISO', '<=', endISO)
  );
  const snapViajes = await getDocs(qViajes);
  snapViajes.docs.forEach(docSnap => {
    const d = docSnap.data();
    if (!d.fechaISO) return;
    const entry = ensureDate(d.fechaISO);
    if (d.viaje) {
      entry.tieneViajes = true;
      entry.viajesCount++;
    }
    if (d.planilla && d.planilla.conductor) {
      entry.tienePlanillas = true;
      entry.planillasCount++;
    }
  });

  const qTelem = query(
    collection(db, 'telemetria'),
    where('fechaISO', '>=', startISO),
    where('fechaISO', '<=', endISO)
  );
  const snapTelem = await getDocs(qTelem);
  snapTelem.docs.forEach(docSnap => {
    const d = docSnap.data();
    if (!d.fechaISO) return;
    const entry = ensureDate(d.fechaISO);
    entry.tieneTelemetria = true;
    entry.excesosCount += Number(d.totalExcesos) || 0;
  });

  if (canPersist && Object.keys(byDate).length > 0) {
    try {
      const batch = writeBatch(db);
      Object.values(byDate).forEach(item => {
        batch.set(doc(db, 'resumen_diario', item.fechaISO), {
          ...item,
          actualizadoEn: new Date()
        }, { merge: true });
      });
      await batch.commit();
    } catch (e) {
      console.warn('No se pudo persistir resumen sincronizado:', e);
    }
  }

  return byDate;
}

/**
 * Obtiene el historial de auditoría de cargas desde la colección 'cargas'.
 */
export async function fetchUploadLogs(maxItems = 80) {
  try {
    const q = query(
      collection(db, 'cargas'),
      orderBy('fecha', 'desc'),
      limit(maxItems)
    );
    const snap = await getDocs(q);
    const logs = snap.docs.map(d => {
      const data = d.data() || {};
      let parsedDate = null;
      if (data.fecha?.toDate) parsedDate = data.fecha.toDate();
      else if (data.fecha) parsedDate = new Date(data.fecha);
      return {
        id: d.id,
        tipo: data.tipo || 'desconocido',
        archivo: data.archivo || 'Sin nombre',
        registros: Number(data.registros) || 0,
        fechasDatos: data.fechasDatos || null,
        usuario: data.usuario || 'Desconocido',
        uid: data.uid || null,
        fecha: parsedDate
      };
    });
    return { logs, restricted: false };
  } catch (err) {
    console.warn('Acceso restringido o error al leer historial de cargas:', err);
    return { logs: [], restricted: true };
  }
}
