<script setup>
import { ref, watch } from 'vue'
import { parseTikTokLink, tiktokResolvePath } from '../../lib/tiktok'

const props = defineProps({ song: { type: Object, required: true } })
const artwork = ref('')
const artworkElement = ref(null)
const nearViewport = ref(false)
const fallback = '/images/song-artwork.svg'
// Share requests when a song appears more than once; URLs also invalidate
// cached artwork naturally when a saved link changes.
const cache = artworkCache
let requestId = 0
watch([artworkElement, () => props.song.audioUrl], ([element, value], _, onCleanup) => {
  if (!element || nearViewport.value || !parseTikTokLink(value)) return
  if (typeof IntersectionObserver !== 'function') {
    nearViewport.value = true
    return
  }
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return
    nearViewport.value = true
    observer.disconnect()
  }, { rootMargin: '200px' })
  observer.observe(element)
  onCleanup(() => observer.disconnect())
})

watch(() => [props.song.audioUrl, props.song.cover, nearViewport.value], async () => {
  const request = ++requestId
  artwork.value = ''
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
      if (tiktok.kind === 'unsupported' || !nearViewport.value) return
    } else if (!['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'].includes(host)) return
    const key = tiktok?.kind === 'post' ? `tiktok:${tiktok.id}` : tiktok?.url || url.href
    if (!cache.has(key)) {
      const endpoint = tiktok
        ? `${tiktokResolvePath}?${new URLSearchParams({ artwork: '1', url: tiktok.url || url.href })}`
        : `https://soundcloud.com/oembed?${new URLSearchParams({ format: 'json', url: url.href })}`
      const pending = fetch(endpoint, { signal: AbortSignal.timeout(8000) })
        .then(response => response.ok ? response.json() : null)
        .then(data => {
          const coverUrl = tiktok ? data?.thumbnailUrl : data?.thumbnail_url
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
  <span ref="artworkElement" class="song-artwork">
    <img :src="artwork || fallback" :alt="`Ảnh bìa ${song.title} — ${song.artist}`" loading="lazy" decoding="async" @error="artwork = ''" />
  </span>
</template>

<style scoped>
.song-artwork{display:block;overflow:hidden;border-radius:5px;background:#e4e9db;box-shadow:0 1px 3px #283b2026}
.song-artwork img{display:block;width:100%;height:100%;object-fit:cover}
</style>
