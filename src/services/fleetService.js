import { collection, doc, writeBatch, getDoc, getDocs, query, where, setDoc, addDoc } from 'firebase/firestore';
import { db } from './firebase.js';
import { tripToDoc, telemetryToDocs, sanitizeId, docToTrip, docToTelemetry } from './mappers.js';

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
export async function logUpload(uploader, { tipo, archivo, registros }) {
  try {
    await addDoc(collection(db, 'cargas'), {
      tipo,
      archivo: archivo || null,
      registros: registros || 0,
      usuario: uploader?.email || null,
      uid: uploader?.uid || null,
      fecha: new Date()
    });
  } catch (err) {
    console.warn('No se pudo registrar la subida:', err);
  }
}

/**
 * Obtiene el rol del usuario desde usuarios/{uid}. Sin rol asignado => 'visor'.
 */
export async function fetchUserRole(uid, email) {
  if (email && email.toLowerCase() === 'sistemas@sotrauraba.com.co') return 'admin';
  try {
    const snap = await getDoc(doc(db, 'usuarios', uid));
    const rol = snap.exists() ? snap.data().rol : null;
    return ['admin', 'operador', 'visor'].includes(rol) ? rol : 'visor';
  } catch (err) {
    console.warn('No se pudo obtener el rol, se asigna visor:', err);
    return 'visor';
  }
}

/**
 * Upsert Trips
 */
export async function upsertTrips(trips, onProgress, uploader) {
  const collectionRef = collection(db, 'viajes');
  const resumenRef = collection(db, 'resumen_diario');
  const uniqueDates = new Set();
  
  await executeInBatches(trips, async (batch, trip) => {
    const docData = tripToDoc(trip);
    if (!docData.id) return;
    const docRef = doc(collectionRef, docData.id);
    
    if (docData.fechaISO) uniqueDates.add(docData.fechaISO);
    
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
      summaryBatch.set(doc(resumenRef, date), {
        fechaISO: date,
        tieneViajes: true,
        actualizadoEn: new Date()
      }, { merge: true });
    });
    await summaryBatch.commit();
  }
}

/**
 * Upsert Planillas
 * planillasMap is a Map<viajeId, conductor>
 */
export async function upsertPlanillas(planillasMap, onProgress, uploader) {
  const collectionRef = collection(db, 'viajes');
  const entries = Array.from(planillasMap.entries());
  
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
