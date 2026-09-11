import { openDB } from 'idb';

const DB_NAME = 'dashboard-flotas';
const DB_VERSION = 1;
const STORE_NAME = 'app-data';

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

export async function saveData(key, value) {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, value, key);
  } catch (err) {
    console.warn('Error saving to IndexedDB:', err);
  }
}

export async function loadData(key) {
  try {
    const db = await getDB();
    return await db.get(STORE_NAME, key);
  } catch (err) {
    console.warn('Error loading from IndexedDB:', err);
    return null;
  }
}

export async function clearAllData() {
  try {
    const db = await getDB();
    await db.clear(STORE_NAME);
  } catch (err) {
    console.warn('Error clearing IndexedDB:', err);
  }
}
