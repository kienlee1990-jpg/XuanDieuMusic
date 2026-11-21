<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getTikTokEmbedUrl, parseTikTokLink, resolveTikTokLink, tiktokOrigin } from '../../lib/tiktok'

const props = defineProps<{ url: string; title: string; active: boolean }>()
const emit = defineEmits<{ playing: [value: boolean]; duration: [seconds: number]; ended: [] }>()
const frame = ref<HTMLIFrameElement>()
const embed = ref(getTikTokEmbedUrl(props.url, !props.active))
const message = ref('')
const controller = new AbortController()
let post = parseTikTokLink(props.url)
let ready = false
let playing = false
let ended = false
let previousTime: { currentTime: number; duration: number } | undefined
let resumeUntil = 0
let autoplayBlocked = false
let autoplayObserver: IntersectionObserver | undefined
let soundRestoreAfter = 0
let priming = !props.active
let waitingForBackgroundStart = false
let reportedDuration = 0

function send(type: string, value?: number) {
  if (!ready || !frame.value?.contentWindow) return false
  frame.value.contentWindow.postMessage({ type, value, 'x-tiktok-player': true }, tiktokOrigin)
  return true
}

function playWithSound() {
  send('unMute')
  return send('play')
}

function startAutoplay() {
  if (playing || !playWithSound()) return
  waitingForBackgroundStart = document.hidden
  if (!frame.value || typeof IntersectionObserver !== 'function') return
  autoplayObserver?.disconnect()
  autoplayObserver = new IntersectionObserver(([entry], observer) => {
    if (!entry.isIntersecting) return
    observer.disconnect()
    if (props.active && !playing && !autoplayBlocked) playWithSound()
  }, { threshold: 0.25 })
  autoplayObserver.observe(frame.value)
}

watch(() => props.active, active => {
  autoplayObserver?.disconnect()
  resumeUntil = 0
  waitingForBackgroundStart = false
  previousTime = undefined
  reportedDuration = 0
  if (!active) {
    priming = false
    playing = false
    send('pause')
    return
  }
  ended = false
  autoplayBlocked = false
  send('seekTo', 0)
  startAutoplay()
}, { flush: 'post' })

function onVisibilityChange() {
  // Only retry a pause that follows switching away from an already playing video.
  resumeUntil = props.active && document.hidden && playing ? performance.now() + 1500 : 0
  if (props.active && !document.hidden && waitingForBackgroundStart) {
    waitingForBackgroundStart = false
    if (!playing) startAutoplay()
  }
}

function reportEnded() {
  if (ended) return
  ended = true
  previousTime = undefined
  resumeUntil = 0
  playing = false
  emit('playing', false)
  emit('ended')
}

function checkPhotoLoop(value: { currentTime: number; duration: number } | undefined) {
  if (ended || !value || !Number.isFinite(value.currentTime) || !Number.isFinite(value.duration) || value.duration <= 0) return
  const { currentTime, duration } = value
  // Photo posts can loop their audio without reporting an ended state.
  const edge = Math.min(2, duration / 4)
  if (previousTime?.duration === duration && previousTime.currentTime >= duration - edge && currentTime < edge) {
    send('pause')
    reportEnded()
    return
  }
  previousTime = { currentTime, duration }
}

function onPlayerMessage(event: MessageEvent) {
  if (event.origin !== tiktokOrigin || event.source !== frame.value?.contentWindow) return
  const data = event.data
  if (data?.['x-tiktok-player'] !== true) return

  if (data.type === 'onPlayerReady' && !ready) {
    ready = true
    if (props.active) startAutoplay()
    else if (priming) {
      send('mute')
      send('play')
    }
  }
  if (!props.active) {
    if (data.type === 'onStateChange' && data.value === 1) {
      priming = false
      send('pause')
    }
    return
  }
  // The embed can mute itself again when it scrolls into view.
  if (data.type === 'onMute' && data.value === true && !document.hidden && performance.now() >= soundRestoreAfter) {
    soundRestoreAfter = performance.now() + 1500
    send('unMute')
  }
  if (data.type === 'onStateChange') {
    if (data.value === 0) {
      reportEnded()
      return
    }
    playing = data.value === 1
    emit('playing', playing)
    if (playing) {
      ended = false
      waitingForBackgroundStart = false
      autoplayObserver?.disconnect()
      autoplayBlocked = false
      message.value = ''
    }
    if (data.value === 2 && document.hidden && performance.now() < resumeUntil) {
      resumeUntil = 0
      playWithSound()
    }
  }
  if (data.type === 'onCurrentTime') {
    const seconds = data.value?.duration
    if (Number.isFinite(seconds) && seconds > 0 && seconds !== reportedDuration) {
      reportedDuration = seconds
      emit('duration', seconds)
    }
    if (post?.kind === 'post' && post.isPhoto) checkPhotoLoop(data.value)
  }
  if (data.type === 'onPlayerError' || data.type === 'onError') {
    if (data.value?.errorCode === 3002) {
      autoplayBlocked = true
      message.value = 'Trình duyệt chặn tự phát có tiếng. Bấm nút phát trong khung TikTok.'
    } else {
      message.value = 'TikTok không phát được bài này tại đây.'
    }
  }
}

onMounted(async () => {
  window.addEventListener('message', onPlayerMessage)
  document.addEventListener('visibilitychange', onVisibilityChange)
  if (embed.value) return
  try {
    const url = await resolveTikTokLink(props.url, controller.signal)
    if (!controller.signal.aborted) {
      post = parseTikTokLink(url)
      embed.value = getTikTokEmbedUrl(url, !props.active)
    }
  } catch (error) {
    if (!controller.signal.aborted && error instanceof Error) message.value = error.message
  }
})

onBeforeUnmount(() => {
  controller.abort()
  autoplayObserver?.disconnect()
  window.removeEventListener('message', onPlayerMessage)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

defineExpose({
  toggle: () => {
    resumeUntil = 0
    waitingForBackgroundStart = false
    return playing ? send('pause') : playWithSound()
  },
  restart: () => { previousTime = undefined; send('seekTo', 0); playWithSound() },
})
</script>

<template>
  <iframe v-if="embed" ref="frame" class="tiktok-embed" :src="embed" :title="title"
    allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen />
  <div v-else-if="!message" class="embed-loading" role="status">Đang mở liên kết TikTok…</div>
  <p v-if="message" role="status">{{ message }}</p>
</template>

<style scoped>
.tiktok-embed {
  display: block;
  width: 100%;
  max-width: 325px;
  aspect-ratio: 325 / 578;
  margin-inline: auto;
  border: 0;
  border-radius: 4px;
  background: #171717;
}
</style>
