/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_FIREBASE_API_KEY: string;
    readonly VITE_FIREBASE_AUTH_DOMAIN: string;
    readonly VITE_FIREBASE_PROJECT_ID: string;
    readonly VITE_FIREBASE_STORAGE_BUCKET: string;
    readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
    readonly VITE_FIREBASE_APP_ID: string;
    readonly VITE_FIREBASE_MEASUREMENT_ID: string;
    readonly VITE_USE_FIREBASE_EMULATORS?: string;
    readonly VITE_GEMINI_API_KEY?: string;
    readonly VITE_LSEG_API_KEY?: string;
    readonly VITE_LSEG_PRODUCT_ID?: string;
    readonly VITE_ENABLE_GEMINI_SIM?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
