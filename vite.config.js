import { defineConfig } from 'vite';

// In development the multiplayer server (npm run server, port 8787) sits behind /ws on the same
// origin, exactly like production, so the client never needs a different URL per environment.
const GAME_SERVER = process.env.GAME_SERVER || 'http://localhost:8787';

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/ws': { target: GAME_SERVER, ws: true, changeOrigin: true },
      '/health': GAME_SERVER,
      '/stats': GAME_SERVER,
    },
  },
  preview: {
    proxy: {
      '/ws': { target: GAME_SERVER, ws: true, changeOrigin: true },
    },
  },
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
});
