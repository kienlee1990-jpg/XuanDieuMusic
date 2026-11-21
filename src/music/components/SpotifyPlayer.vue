<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({ url: String, fallbackUrl: String, title: String })
const emit = defineEmits(['playing', 'duration', 'ended'])
const container = ref(null)
const useFallback = ref(false)
let controller
let ready = false
let disposed = false
let waitingToPlay = true
let previous

function updatePlayback({ data }) {
  if (disposed || !data) return
  const { isPaused, isBuffering, playingURI, duration, position } = data
  const wasPlaying = previous && !previous.isPaused && previous.playingURI === playingURI
  if (Number.isFinite(duration) && duration > 0) emit('duration', duration / 1000)
  emit('playing', !isPaused && !isBuffering)
  if (!isPaused && position > 0) waitingToPlay = false
  if (!isBuffering && Number.isFinite(position) && Number.isFinite(duration)) {
    const reachedEnd = duration > 0 && previous?.position < duration && position >= duration
    const pausedAtEnd = duration > 0 && isPaused && position >= duration - 100
    const resetFromEnd = duration > 0 && previous?.duration === duration
      && previous.position >= duration - 1000 && position <= 100
    previous = data
    if (wasPlaying && (reachedEnd || pausedAtEnd || (isPaused && resetFromEnd))) emit('ended')
  }
}

function onVisibilityChange() {
  if (!document.hidden && ready && waitingToPlay) controller.play()
}

onMounted(async () => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  try {
    const api = await loadSpotifyApi()
    if (disposed) return
    api.createController(container.value, { url: props.url, width: '100%', height: 300 }, embed => {
      if (disposed) {
        embed.destroy()
        return
      }
      controller = embed
      embed.addListener('playback_update', updatePlayback)
      embed.addListener('ready', () => {
        if (disposed) return
        ready = true
        embed.play()
      })
    })
  } catch {
    if (!disposed) useFallback.value = true
  }
})

onBeforeUnmount(() => {
  disposed = true
  document.removeEventListener('visibilitychange', onVisibilityChange)
  controller?.destroy()
})

defineExpose({
  toggle() {
    if (!ready) return false
    waitingToPlay = false
    controller.togglePlay()
    return true
  },
  restart() { controller?.restart() },
})
</script>

<script>
let spotifyApi

function loadSpotifyApi() {
  spotifyApi ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const timeout = setTimeout(onError, 10000)
    window.onSpotifyIframeApiReady = api => {
      clearTimeout(timeout)
      resolve(api)
    }
    function onError() {
      clearTimeout(timeout)
      script.remove()
      reject(new Error('Spotify iFrame API unavailable'))
    }
    script.src = 'https://open.spotify.com/embed/iframe-api/v1'
    script.onerror = onError
    document.head.appendChild(script)
  }).catch(error => { spotifyApi = undefined; throw error })
  return spotifyApi
}
</script>

<template>
  <iframe v-if="useFallback" class="soundcloud-embed" :src="fallbackUrl" :title="title"
    allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen />
  <div v-else :aria-label="title">
    <div ref="container"></div>
  </div>
</template>
