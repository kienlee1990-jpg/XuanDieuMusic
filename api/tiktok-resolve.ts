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

async function artwork(id: string, signal: AbortSignal) {
  // TikTok's public video detail page contains the cover for photo posts too.
  const response = await fetch(`${tiktokOrigin}/@/video/${id}`, { redirect: 'error', signal })
  if (!response.ok) return Response.json({ error: 'TikTok post unavailable' }, { status: 404 })

  const page = await response.text()
  const data = page.match(/<script\b[^>]*\bid=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1]
  const item = data
    ? (JSON.parse(data) as TikTokPage).__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct
    : undefined
  const photo = item?.imagePost
  const cover = photo?.cover?.imageURL?.urlList?.[0] || photo?.images?.[0]?.imageURL?.urlList?.[0] || item?.video?.cover
  const url = typeof cover === 'string' ? URL.parse(cover) : null
  if (item?.id !== id || !url || url.protocol !== 'https:' || url.username || url.password || url.port
    || !['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com'].some(domain => url.hostname.endsWith(`.${domain}`))) {
    return Response.json({ error: 'TikTok artwork not found' }, { status: 404 })
  }
  return Response.json({ thumbnailUrl: url.href }, {
    headers: { 'Cache-Control': 'public, max-age=300', 'Vercel-CDN-Cache-Control': 'public, s-maxage=900' },
  })
}

async function resolve(request: Request) {
  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { Allow: 'GET' } })
  }

  const query = new URL(request.url).searchParams
  const thumbnail = query.get('artwork') === '1'
  const value = query.get('url') ?? ''
  let link = parseTikTokLink(value)
  if (link?.kind !== 'short' && !(thumbnail && link?.kind === 'post')) {
    return Response.json({ error: 'Invalid TikTok link' }, { status: 400 })
  }

  const signal = AbortSignal.timeout(6000)
  try {
    if (link?.kind === 'post') return await artwork(link.id, signal)
    for (let hop = 0; hop < 4 && link?.kind === 'short'; hop++) {
      const response = await fetch(link.url, { redirect: 'manual', signal })
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location || ![301, 302, 303, 307, 308].includes(response.status)) break

      const target = new URL(location, link.url)
      link = parseTikTokLink(target.href)
      if (link?.kind === 'post') {
        if (thumbnail) return await artwork(link.id, signal)
        return Response.json({ url: `${tiktokOrigin}${target.pathname}` })
      }
    }
  } catch {
    return Response.json({ error: 'TikTok request failed' }, { status: 502 })
  }
  return Response.json({ error: 'TikTok post not found' }, { status: 404 })
}

export default { fetch: resolve }
