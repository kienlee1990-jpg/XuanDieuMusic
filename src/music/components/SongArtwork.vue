<script setup>
import { ref, watch } from 'vue'
import { parseTikTokLink, tiktokOrigin, tiktokResolvePath } from '../../lib/tiktok'

const props = defineProps({ song: { type: Object, required: true } })
const artwork = ref('')
const fallback = '/images/song-artwork.svg'
// Share requests when a song appears more than once; URLs also invalidate
// cached artwork naturally when a saved link changes.
const cache = artworkCache
let requestId = 0
let tiktokArtworkUrl = ''
function handleArtworkError() {
  if (tiktokArtworkUrl && artwork.value === tiktokArtworkUrl) {
    artwork.value = `${tiktokArtworkUrl}&retry=1`
  } else if (artwork.value) {
    artwork.value = ''
  }
}

watch(() => [props.song.audioUrl, props.song.cover], async () => {
  const request = ++requestId
  artwork.value = ''
  tiktokArtworkUrl = ''
  const cover = props.song.cover
  if (typeof cover === 'string' && (/^https:\/\//.test(cover) || /^\/(?!\/)/.test(cover))) {
    artwork.value = cover
    return
  }
  try {
    const url = new URL(props.song.audioUrl)
    const host = url.hostname.toLowerCase()
    const tiktok = parseTikTokLink(url.href)
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'].includes(host)) {
      const parts = url.pathname.split('/').filter(Boolean)
      const id = host === 'youtu.be' ? parts[0] : url.searchParams.get('v') || (['embed', 'shorts', 'live', 'v'].includes(parts[0]) ? parts[1] : '')
      if (/^[\w-]{11}$/.test(id || '')) artwork.value = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
      return
    }
    if (tiktok) {
      if (tiktok.kind === 'unsupported') return
      const lookup = tiktok.kind === 'short' ? tiktok.url : `${tiktokOrigin}${url.pathname.replace(/\/$/, '')}`
      tiktokArtworkUrl = `${tiktokResolvePath}?${new URLSearchParams({ artwork: 'image', url: lookup })}`
      artwork.value = tiktokArtworkUrl
      return
    }
    if (!['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'].includes(host)) return
    const key = url.href
    if (!cache.has(key)) {
      const endpoint = `https://soundcloud.com/oembed?${new URLSearchParams({ format: 'json', url: url.href })}`
      const pending = fetch(endpoint, { signal: AbortSignal.timeout(8000) })
        .then(response => response.ok ? response.json() : null)
        .then(data => {
          const coverUrl = data?.thumbnail_url
          return typeof coverUrl === 'string' && coverUrl.startsWith('https://') && !coverUrl.includes('/images/fb_placeholder.png') ? coverUrl : ''
        })
        .catch(() => { cache.delete(key); return '' })
      cache.set(key, pending)
    }
    const thumbnail = await cache.get(key)
    if (request === requestId) artwork.value = thumbnail
  } catch { /* Local files and unavailable artwork use the record sleeve. */ }
}, { immediate: true })
</script>

<script>
const artworkCache = new Map()
</script>

<template>
  <span class="song-artwork">
    <img :key="artwork || fallback" :src="artwork || fallback" :alt="`Ảnh bìa ${song.title} — ${song.artist}`" loading="lazy" decoding="async" @error="handleArtworkError" />
  </span>
</template>

<style scoped>
.song-artwork{display:block;overflow:hidden;border-radius:5px;background:#e4e9db;box-shadow:0 1px 3px #283b2026}
.song-artwork img{display:block;width:100%;height:100%;object-fit:cover}
</style>
