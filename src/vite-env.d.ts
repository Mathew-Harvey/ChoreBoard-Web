/// <reference types="vite/client" />

// Project-specific env vars beyond Vite's built-ins. Adding them here gives
// us proper IntelliSense + typechecking on `import.meta.env.VITE_*` access.
interface ImportMetaEnv {
  readonly VITE_API_PROXY?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_BUILD_TARGET?: 'web' | 'native';
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
