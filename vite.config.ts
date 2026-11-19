import { defineConfig, type Connect } from 'vite'
import vue from '@vitejs/plugin-vue'
import tiktokResolver from './api/tiktok-resolve'
import { tiktokResolvePath } from './src/lib/tiktok'

const resolveTikTok: Connect.NextHandleFunction = async (request, response, next) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (url.pathname !== tiktokResolvePath) return next()

  try {
    const result = await tiktokResolver.fetch(new Request(url, { method: request.method }))
    response.writeHead(result.status, Object.fromEntries(result.headers))
    response.end(await result.text())
  } catch (error) {
    next(error)
  }
}

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'local-tiktok-resolver',
      configureServer: server => { server.middlewares.use(resolveTikTok) },
      configurePreviewServer: server => { server.middlewares.use(resolveTikTok) },
    },
  ],
})
