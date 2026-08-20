// defineConfig comes from vitest/config, not vite — vite's own has no
// `test` key, so the block below would not type-check against it. The
// build behaves identically either way; this is the standard Vitest
// re-export of the same function.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // The app reads localStorage, document and matchMedia at module
    // scope in places, so a node environment is not an option.
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.js',
    // Tests live in tests/, mirroring backend/tests/, and never beside
    // the source. Pinning `include` rather than leaving the default
    // '**/*.test.*' is what keeps that true — a stray src/foo.test.js
    // simply does not run, instead of running and quietly establishing
    // the opposite convention.
    include: ['tests/**/*.test.{js,jsx}'],
  },
})
