import { collection, doc, writeBatch, getDoc, getDocs, query, where, setDoc } from 'firebase/firestore';
import { db } from './firebase.js';
import { tripToDoc, telemetryToDoc, sanitizeId, docToTrip, docToTelemetry } from './mappers.js';

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
 * Upsert Trips
 */
export async function upsertTrips(trips, onProgress) {
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
export async function upsertPlanillas(planillasMap, onProgress) {
  const collectionRef = collection(db, 'viajes');
  const entries = Array.from(planillasMap.entries());
  
  await executeInBatches(entries, async (batch, [viaje, conductor]) => {
    const safeId = sanitizeId(viaje);
    if (!safeId) return;
    const docRef = doc(collectionRef, safeId);
    
    // We only update the 'planilla' field, or create a skeleton if trip doesn't exist yet
    batch.set(docRef, {
      planilla: { conductor },
      actualizadoEn: new Date()
    }, { merge: true });
  }, onProgress);
}

/**
 * Upsert Telemetry (merge points if doc already exists)
 */
export async function upsertTelemetry(telemetryVehicles, onProgress) {
  const collectionRef = collection(db, 'telemetria');
  
  // We can't purely batch write if we need to read first to merge.
  // For telemetry, we will do sequential or Promise.all read-then-write.
  let totalProcessed = 0;
  
  for (const veh of telemetryVehicles) {
    const newDoc = telemetryToDoc(veh);
    const docRef = doc(collectionRef, newDoc.id);
    
    try {
      const existingSnap = await getDoc(docRef);
      if (existingSnap.exists()) {
        const existingData = existingSnap.data();
        
        // Merge points
        const combinedPt = [...(existingData.pt || []), ...newDoc.pt];
        
        // Sort by time (h)
        combinedPt.sort((a, b) => a.h.localeCompare(b.h));
        
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
          pt: uniquePt,
          totalExcesos
        }, { merge: true });
        
      } else {
        await setDoc(docRef, newDoc);
      }
    } catch (err) {
      console.warn("Failed merging telemetry for", newDoc.id, err);
    }
    
    totalProcessed++;
    if (onProgress) onProgress(totalProcessed, telemetryVehicles.length);
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
  return snapshot.docs.map(docSnap => docToTelemetry(docSnap.data()));
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
