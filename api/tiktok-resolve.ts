import { parseTikTokLink, tiktokOrigin } from '../src/lib/tiktok.js'

type TikTokImage = { imageURL?: { urlList?: string[] } }
type TikTokPage = {
  __DEFAULT_SCOPE__?: {
    'webapp.video-detail'?: {
      itemInfo?: {
        itemStruct?: {
          id?: string
          video?: { cover?: string }
          imagePost?: { cover?: TikTokImage; images?: TikTokImage[] }
        }
      }
    }
  }
}

function readCover(page: string, id: string) {
  const data = page.match(/<script\b[^>]*\bid=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1]
  const item = data
    ? (JSON.parse(data) as TikTokPage).__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct
    : undefined
  const photo = item?.imagePost
  const cover = photo?.cover?.imageURL?.urlList?.[0] || photo?.images?.[0]?.imageURL?.urlList?.[0] || item?.video?.cover
  const url = typeof cover === 'string' ? URL.parse(cover) : null
  if (item?.id !== id || !url || url.protocol !== 'https:' || url.username || url.password || url.port
    || !['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com'].some(domain => url.hostname.endsWith(`.${domain}`))) {
    return null
  }
  return url
}

async function artwork(id: string, source: string, signal: AbortSignal, asImage: boolean) {
  // TikTok's public video detail page contains the cover for photo posts too.
  const author = new URL(source).pathname.match(/^\/@([\w.-]+)\//)?.[1]
  const paths = author ? [`/@${author}/video/${id}`, `/@/video/${id}`] : [`/@/video/${id}`]
  let url: URL | null = null
  for (const path of paths) {
    const response = await fetch(tiktokOrigin + path, { redirect: 'manual', signal })
    if (response.ok) url = readCover(await response.text(), id)
    else await response.body?.cancel()
    if (url) break
  }
  if (!url) return Response.json({ error: 'TikTok artwork not found' }, { status: 404 })
  if (asImage) return serveArtworkImage(url, signal)
  return Response.json({ thumbnailUrl: url.href }, {
    headers: { 'Cache-Control': 'public, max-age=300', 'Vercel-CDN-Cache-Control': 'public, s-maxage=900' },
  })
}

async function serveArtworkImage(url: URL, signal: AbortSignal) {
  const upstream = await fetch(url, { redirect: 'error', signal })
  const type = upstream.headers.get('content-type')?.split(';')[0].toLowerCase()
  const maxBytes = 3 * 1024 * 1024
  if (!upstream.ok || !type || !/^image\/(jpeg|png|webp|avif|gif)$/.test(type)
    || Number(upstream.headers.get('content-length')) > maxBytes || !upstream.body) {
    await upstream.body?.cancel()
    return Response.json({ error: 'TikTok artwork image unavailable' }, { status: 502 })
  }

  const reader = upstream.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > maxBytes) {
      await reader.cancel()
      return Response.json({ error: 'TikTok artwork image too large' }, { status: 502 })
    }
    chunks.push(value)
  }
  return new Response(Buffer.concat(chunks, length), {
    headers: {
      'Content-Type': type,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=900',
      'Vercel-CDN-Cache-Control': 'public, s-maxage=3600',
    },
  })
}

async function resolve(request: Request) {
  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { Allow: 'GET' } })
  }

  const query = new URL(request.url).searchParams
  const asImage = query.get('artwork') === 'image'
  const thumbnail = asImage || query.get('artwork') === '1'
  const value = query.get('url') ?? ''
  let link = parseTikTokLink(value)
  if (link?.kind !== 'short' && !(thumbnail && link?.kind === 'post')) {
    return Response.json({ error: 'Invalid TikTok link' }, { status: 400 })
  }

  const signal = AbortSignal.timeout(asImage ? 12000 : 6000)
  try {
    if (link?.kind === 'post') return await artwork(link.id, value, signal, asImage)
    for (let hop = 0; hop < 4 && link?.kind === 'short'; hop++) {
      const response = await fetch(link.url, { redirect: 'manual', signal })
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location || ![301, 302, 303, 307, 308].includes(response.status)) break

      const target = new URL(location, link.url)
      link = parseTikTokLink(target.href)
      if (link?.kind === 'post') {
        if (thumbnail) return await artwork(link.id, target.href, signal, asImage)
        return Response.json({ url: `${tiktokOrigin}${target.pathname}` })
      }
    }
  } catch {
    return Response.json({ error: 'TikTok request failed' }, { status: 502 })
  }
  return Response.json({ error: 'TikTok post not found' }, { status: 404 })
}

export default { fetch: resolve }
