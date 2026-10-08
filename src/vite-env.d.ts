/// <reference types="vite/client" />

/**
 * Compile-time flag injected by vite.config.ts.
 * It is `true` only for `vite serve` when LUDO_DEV_MODE=true; every
 * production build defines it as `false`, so all dev-only code is
 * tree-shaken out of the shipped bundle.
 */
declare const __LUDO_DEV__: boolean;
