import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Forzar que la sesión se cierre al cerrar la pestaña o el navegador
setPersistence(auth, browserSessionPersistence).catch(console.error);

// Inicializamos Firestore con caché local persistente
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true // vital para evitar errores si un campo del excel viene undefined
});
