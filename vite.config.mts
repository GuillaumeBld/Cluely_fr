import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Dev-only: the production CSP in index.html uses a strict `script-src 'self'`
// (no 'unsafe-inline'), but @vitejs/plugin-react injects an inline React-refresh
// preamble during `vite serve`. Relax script-src to allow that inline script in
// dev only; the built index.html keeps the strict policy untouched.
function devCspRelax(): Plugin {
    return {
        name: 'dev-csp-relax',
        apply: 'serve',
        transformIndexHtml(html) {
            return html.replace(
                "script-src 'self' https://www.googletagmanager.com",
                "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com"
            )
        },
    }
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), devCspRelax()],
    base: './', // Use relative paths for Electron
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        port: 5180,
    },
    build: {
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ['react', 'react-dom', 'framer-motion'],
                    ui: ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-toast']
                }
            }
        }
    }
})
