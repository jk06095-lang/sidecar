/**
 * Firebase Configuration
 * 
 * All credentials are loaded from environment variables (VITE_FIREBASE_*).
 * For local development, create a `.env.local` file.
 * For Vercel deployment, set these in the Vercel dashboard → Settings → Environment Variables.
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Validate required config
const requiredKeys = ['apiKey', 'authDomain', 'projectId'] as const;
for (const key of requiredKeys) {
    if (!firebaseConfig[key]) {
        console.warn(`[Firebase] Missing env var: VITE_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}. Using fallback.`);
    }
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firestore
export const db = getFirestore(app);

// Auth
export const auth = getAuth(app);

// Analytics (only in production, SSR-safe)
export let analytics: ReturnType<typeof getAnalytics> | null = null;
isSupported().then(supported => {
    if (supported) {
        analytics = getAnalytics(app);
    }
}).catch(() => { });

// Emulator support for local development
if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectAuthEmulator(auth, 'http://localhost:9099');
    console.info('[Firebase] Connected to local emulators');
}

export default app;
