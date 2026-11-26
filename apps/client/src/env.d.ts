// apps/client/src/env.d.ts
declare module '*.css';
interface ImportMetaEnv { readonly VITE_API_URL?: string; readonly VITE_OFFLINE?: string }
interface ImportMeta { readonly env: ImportMetaEnv }
