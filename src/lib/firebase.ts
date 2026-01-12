import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Fallback logic for build time or missing keys
const getEnv = (key: string, mock: string) => {
    return process.env[key] || mock;
};

const firebaseConfig = {
    apiKey: getEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "mock_key"),
    authDomain: getEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "mock_domain"),
    projectId: getEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "mock_project"),
    storageBucket: getEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "mock_bucket"),
    messagingSenderId: getEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "mock_sender"),
    appId: getEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "mock_app"),
};

// Initialize Firebase only once
let app: FirebaseApp;

if (getApps().length > 0) {
    app = getApps()[0];
} else {
    app = initializeApp(firebaseConfig);
}

export const auth = getAuth(app);
export const db = getFirestore(app);
