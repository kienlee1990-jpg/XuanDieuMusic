import { afterEach, describe, expect, it, vi } from 'vitest'
import resolver from '../../api/tiktok-resolve'
import { getTikTokEmbedUrl, parseTikTokLink, tiktokResolvePath } from './tiktok'

const post = 'https://www.tiktok.com/@/video/7556599604297485580'
const short = 'https://vt.tiktok.com/ShareCode/'

function request(url: string) {
  return new Request(`http://localhost${tiktokResolvePath}?${new URLSearchParams({ url })}`)
}

afterEach(() => vi.unstubAllGlobals())

describe('TikTok post links', () => {
  it('preserves the full post ID when embedding video and photo posts', () => {
    expect(getTikTokEmbedUrl(post)).toContain('/player/v1/7556599604297485580?')
    expect(getTikTokEmbedUrl('https://www.tiktok.com/@creator/photo/7556599604297485580?share=1'))
      .toBe(getTikTokEmbedUrl(post))
    expect(parseTikTokLink('https://www.tiktok.com/@creator')).toEqual({ kind: 'unsupported' })
  })

  it('resolves a share redirect even when TikTok omits the account name', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.redirect(`${post}?tracking=1`))
    vi.stubGlobal('fetch', fetch)

    const response = await resolver.fetch(request(short))

    expect(await response.json()).toEqual({ url: post })
    expect(fetch).toHaveBeenCalledWith(short, expect.objectContaining({ redirect: 'manual' }))
  })

  it('rejects non-TikTok share targets without following them', async () => {
    const unrelated = 'https://vt.tiktok.com.example.com/ShareCode/'
    const fetch = vi.fn().mockResolvedValue(Response.redirect(unrelated))
    vi.stubGlobal('fetch', fetch)

    expect((await resolver.fetch(request(unrelated))).status).toBe(400)
    expect((await resolver.fetch(request(short))).status).toBe(404)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
