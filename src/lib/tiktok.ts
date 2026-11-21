const postHosts = ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com']
const shortHosts = ['vm.tiktok.com', 'vt.tiktok.com']

export const tiktokOrigin = 'https://www.tiktok.com'
export const tiktokResolvePath = '/api/tiktok-resolve'

export function parseTikTokLink(value: string) {
  let url: URL
  try { url = new URL(value) } catch { return null }
  if (!['https:', 'http:'].includes(url.protocol)) return null
  if (!postHosts.includes(url.hostname) && !shortHosts.includes(url.hostname)) return null

  if (!url.username && !url.password && !url.port) {
    // Short links can redirect to /@/video/:id without including a username.
    const post = url.pathname.match(/^\/(?:@[^/]*\/(?:video|photo)|player\/v1)\/(\d{15,25})\/?$/)
    if (post && postHosts.includes(url.hostname)) return { kind: 'post', id: post[1] } as const

    const short = shortHosts.includes(url.hostname)
      ? url.pathname.match(/^\/([\w-]{1,64})\/?$/)
      : url.pathname.match(/^\/t\/([\w-]{1,64})\/?$/)
    if (short) return { kind: 'short', url: `https://${url.hostname}${url.pathname}` } as const
  }

  return { kind: 'unsupported' } as const
}

export async function resolveTikTokLink(value: string, signal?: AbortSignal): Promise<string> {
  const link = parseTikTokLink(value)
  if (!link || link.kind === 'post') return value
  if (link.kind === 'unsupported') throw new Error('Hãy dùng link video hoặc bài ảnh công khai trên TikTok.')

  try {
    const query = new URLSearchParams({ url: link.url })
    const response = await fetch(`${tiktokResolvePath}?${query}`, { signal })
    if (response.ok) {
      const { url } = await response.json()
      if (typeof url === 'string' && parseTikTokLink(url)?.kind === 'post') return url
    }
  } catch (error) {
    if (signal?.aborted) throw error
  }
  throw new Error('Không mở được link TikTok rút gọn. Hãy thử dùng link đầy đủ của bài đăng.')
}

export function getTikTokEmbedUrl(value: string) {
  const link = parseTikTokLink(value)
  return link?.kind === 'post'
    ? `${tiktokOrigin}/player/v1/${link.id}?autoplay=1&music_info=1&rel=0&volume_control=0`
    : ''
}
