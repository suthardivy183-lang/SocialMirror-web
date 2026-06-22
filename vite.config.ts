import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
  },
  optimizeDeps: {
    // @xenova/transformers ships its own ESM build — exclude from pre-bundling
    exclude: ['@xenova/transformers'],
  },
})
