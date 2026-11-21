<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { getTikTokEmbedUrl, resolveTikTokLink, tiktokOrigin } from '../../lib/tiktok'

const props = defineProps<{ url: string; title: string }>()
const emit = defineEmits<{ playing: [value: boolean]; ended: [] }>()
const frame = ref<HTMLIFrameElement>()
const embed = ref(getTikTokEmbedUrl(props.url))
const message = ref('')
const controller = new AbortController()
let ready = false
let playing = false
let resumeUntil = 0
let autoplayBlocked = false
let autoplayObserver: IntersectionObserver | undefined
let soundRestoreAfter = 0

function send(type: string, value?: number) {
  if (!ready || !frame.value?.contentWindow) return false
  frame.value.contentWindow.postMessage({ type, value, 'x-tiktok-player': true }, tiktokOrigin)
  return true
}

function playWithSound() {
  send('unMute')
  return send('play')
}

function onVisibilityChange() {
  // Only retry a pause that follows switching away from an already playing video.
  resumeUntil = document.hidden && playing ? performance.now() + 1500 : 0
}

function onPlayerMessage(event: MessageEvent) {
  if (event.origin !== tiktokOrigin || event.source !== frame.value?.contentWindow) return
  const data = event.data
  if (data?.['x-tiktok-player'] !== true) return

  if (data.type === 'onPlayerReady' && !ready) {
    ready = true
    if (!playing) {
      playWithSound()
      if (frame.value && typeof IntersectionObserver === 'function') {
        autoplayObserver = new IntersectionObserver(([entry], observer) => {
          if (!entry.isIntersecting) return
          observer.disconnect()
          if (!playing && !autoplayBlocked) playWithSound()
        }, { threshold: 0.25 })
        autoplayObserver.observe(frame.value)
      }
    }
  }
  // The embed can mute itself again when it scrolls into view.
  if (data.type === 'onMute' && data.value === true && !document.hidden && performance.now() >= soundRestoreAfter) {
    soundRestoreAfter = performance.now() + 1500
    send('unMute')
  }
  if (data.type === 'onStateChange') {
    playing = data.value === 1
    emit('playing', playing)
    if (playing) {
      autoplayObserver?.disconnect()
      autoplayBlocked = false
      message.value = ''
    }
    if (data.value === 2 && document.hidden && performance.now() < resumeUntil) {
      resumeUntil = 0
      playWithSound()
    }
    if (data.value === 0) emit('ended')
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
    if (!controller.signal.aborted) embed.value = getTikTokEmbedUrl(url)
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
    return playing ? send('pause') : playWithSound()
  },
  restart: () => { send('seekTo', 0); playWithSound() },
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
