import { parseTikTokLink, tiktokOrigin } from '../src/lib/tiktok.ts'

async function resolve(request: Request) {
  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { Allow: 'GET' } })
  }

  const value = new URL(request.url).searchParams.get('url') ?? ''
  let link = parseTikTokLink(value)
  if (link?.kind !== 'short') return Response.json({ error: 'Invalid short link' }, { status: 400 })

  const signal = AbortSignal.timeout(6000)
  try {
    for (let hop = 0; hop < 4 && link?.kind === 'short'; hop++) {
      const response = await fetch(link.url, { redirect: 'manual', signal })
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location || ![301, 302, 303, 307, 308].includes(response.status)) break

      const target = new URL(location, link.url)
      link = parseTikTokLink(target.href)
      if (link?.kind === 'post') {
        return Response.json({ url: `${tiktokOrigin}${target.pathname}` })
      }
    }
  } catch {
    return Response.json({ error: 'TikTok request failed' }, { status: 502 })
  }
  return Response.json({ error: 'TikTok post not found' }, { status: 404 })
}

export default { fetch: resolve }
