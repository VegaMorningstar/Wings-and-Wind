import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Vite config — https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const emitSourcemaps = mode === 'development'

  return {
    // Relative, so the build does not care where it is served from.
    //
    // A GitHub Pages project site lives under /<repo-name>/, and baking that
    // name in at build time means renaming the repository silently breaks the
    // deployed site: Pages moves the URL but keeps serving the last artifact,
    // which still points every asset at the old name. That is a blank page
    // with no error anywhere obvious.
    //
    // Relative paths resolve against the document, which is safe here because
    // routing is hash-only, so the document path never changes. Set
    // PUBLIC_BASE_PATH if you ever need an absolute base instead.
    base: process.env.PUBLIC_BASE_PATH ? `${process.env.PUBLIC_BASE_PATH}/` : './',
    build: {
      sourcemap: emitSourcemaps ? 'inline' : false,
      minify: !emitSourcemaps,
    },
    plugins: [react(), tailwindcss(), errorOverlayReplay(), reactRefreshBoundaryFallback()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: process.env.DEV_SERVER_HOST || '0.0.0.0',
      port: parseInt(process.env.PORT || '8443'),
      strictPort: true,
    },
    preview: {
      host: process.env.DEV_SERVER_HOST || '0.0.0.0',
      port: parseInt(process.env.PORT || '8443'),
    },
  }
})

/**
 * Replay the most recent build error to clients that connect after it was
 * first broadcast. Vite buffers an error payload only while no clients are
 * connected and clears the buffer on the first reconnect (see
 * `bufferedMessage` in `createWebSocketServer`), so a page that reloads
 * after Vite already delivered an error to a live socket misses the payload
 * and the overlay stays hidden even though the build is still broken. This
 * intercepts `ws.send` to remember the latest error and replay it on every
 * new connection; the cache clears on a successful `update` or
 * `full-reload` so a stale overlay can't survive a fixed build.
 */
function errorOverlayReplay(): Plugin {
  return {
    name: 'error-overlay-replay',
    apply: 'serve',
    configureServer(server) {
      let lastError: object | null = null

      const origSend = server.ws.send.bind(server.ws) as (...args: any[]) => void
      server.ws.send = ((...args: any[]) => {
        const payload = args[0]
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
          const type = (payload as { type?: string }).type
          if (type === 'error') {
            lastError = payload as object
          } else if (type === 'update' || type === 'full-reload') {
            lastError = null
          }
        }
        return origSend(...args)
      }) as typeof server.ws.send

      server.ws.on('connection', (socket) => {
        if (lastError !== null) {
          socket.send(JSON.stringify(lastError))
        }
      })
    },
  }
}

/**
 * Reload when a module that previously defined a React Refresh boundary stops
 * defining one. This happens when an agent moves a component into a new file
 * and replaces the old module with a re-export:
 *
 *   export { default } from './app/App'
 *
 * Vite otherwise accepts the update using the previous module's HMR boundary,
 * but the re-export-only transform no longer registers a replacement for the
 * mounted component family. React reports a successful refresh while leaving
 * the old tree mounted until the page is reloaded.
 */
function reactRefreshBoundaryFallback(): Plugin {
  const hadRefreshBoundary = new Map<string, boolean>()
  let sendFullReload: (() => void) | null = null

  return {
    name: 'react-refresh-boundary-fallback',
    apply: 'serve',
    enforce: 'post',
    configureServer(server) {
      sendFullReload = () => server.ws.send({ type: 'full-reload', path: '*' })
    },
    transform(code, id) {
      if (!/\.[jt]sx?(?:\?|$)/.test(id) || id.includes('/node_modules/')) return null

      const moduleId = id.split('?')[0] ?? id
      const hasRefreshBoundary = code.includes('registerExportsForReactRefresh')
      const previousHadRefreshBoundary = hadRefreshBoundary.get(moduleId)
      hadRefreshBoundary.set(moduleId, hasRefreshBoundary)

      if (previousHadRefreshBoundary && !hasRefreshBoundary) {
        queueMicrotask(() => sendFullReload?.())
      }

      return null
    },
  }
}
