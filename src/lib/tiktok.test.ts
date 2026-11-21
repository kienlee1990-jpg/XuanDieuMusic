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
    expect(parseTikTokLink('https://www.tiktok.com/@creator/photo/7556599604297485580')).toMatchObject({ isPhoto: true })
    expect(parseTikTokLink(post)).toMatchObject({ isPhoto: false })
  })

  it('only starts the preloaded player muted', () => {
    const active = new URL(getTikTokEmbedUrl(post))
    const preloaded = new URL(getTikTokEmbedUrl(post, true))
    expect(active.searchParams.get('muted')).toBeNull()
    expect(preloaded.searchParams.get('muted')).toBe('1')
  })

  it('resolves a share redirect even when TikTok omits the account name', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.redirect(`${post}?tracking=1`))
    vi.stubGlobal('fetch', fetch)

    const response = await resolver.fetch(request(short))

    expect(await response.json()).toEqual({ url: post })
    expect(fetch).toHaveBeenCalledWith(short, expect.objectContaining({ redirect: 'manual' }))
  })

  it('uses the first photo from the requested TikTok post when no cover is supplied', async () => {
    const thumbnailUrl = 'https://p16-common-sign.tiktokcdn.com/photo.jpeg'
    const itemStruct = {
      id: '7556599604297485580',
      video: { cover: 'https://p16-common-sign.tiktokcdn.com/video.jpeg' },
      imagePost: { images: [{ imageURL: { urlList: [thumbnailUrl] } }] },
    }
    const data = { __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct } } } }
    const fetch = vi.fn().mockResolvedValue(new Response(
      `<script type="application/json" id="__UNIVERSAL_DATA_FOR_REHYDRATION__">${JSON.stringify(data)}</script>`,
    ))
    vi.stubGlobal('fetch', fetch)

    const response = await resolver.fetch(new Request(`${request(post).url}&artwork=1`))

    expect(await response.json()).toEqual({ thumbnailUrl })
    expect(fetch).toHaveBeenCalledWith(post, expect.objectContaining({ redirect: 'manual' }))
  })

  it('serves TikTok image bytes from the artwork endpoint', async () => {
    const cover = 'https://p16-common-sign.tiktokcdn.com/cover.jpeg'
    const itemStruct = { id: '7556599604297485580', video: { cover } }
    const data = { __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct } } } }
    const image = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(`<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">${JSON.stringify(data)}</script>`))
      .mockResolvedValueOnce(new Response(image, { headers: { 'Content-Type': 'image/jpeg' } }))
    vi.stubGlobal('fetch', fetch)

    const response = await resolver.fetch(new Request(`${request(post).url}&artwork=image`))

    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(image)
    expect(fetch.mock.calls[1][0].href).toBe(cover)
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
