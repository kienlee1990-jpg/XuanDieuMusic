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

function send(type: string, value?: number) {
  if (!ready || !frame.value?.contentWindow) return false
  frame.value.contentWindow.postMessage({ type, value, 'x-tiktok-player': true }, tiktokOrigin)
  return true
}

function onPlayerMessage(event: MessageEvent) {
  if (event.origin !== tiktokOrigin || event.source !== frame.value?.contentWindow) return
  const data = event.data
  if (data?.['x-tiktok-player'] !== true) return

  if (data.type === 'onPlayerReady') ready = true
  if (data.type === 'onStateChange') {
    playing = data.value === 1
    emit('playing', playing)
    if (playing) message.value = ''
    if (data.value === 0) emit('ended')
  }
  if (data.type === 'onPlayerError' || data.type === 'onError') {
    message.value = data.value?.errorCode === 3002
      ? 'Bấm nút phát trong khung TikTok để nghe.'
      : 'TikTok không phát được bài này tại đây. Bạn có thể thử mở bài gốc.'
  }
}

onMounted(async () => {
  window.addEventListener('message', onPlayerMessage)
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
  window.removeEventListener('message', onPlayerMessage)
})

defineExpose({
  toggle: () => send(playing ? 'pause' : 'play'),
  restart: () => { send('seekTo', 0); send('play') },
})
</script>

<template>
  <iframe v-if="embed" ref="frame" class="tiktok-embed" :src="embed" :title="title"
    allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen />
  <div v-else-if="!message" class="embed-loading" role="status">Đang mở liên kết TikTok…</div>
  <p v-if="message" role="status">{{ message }}</p>
  <p><a class="provider-fallback" :href="url" target="_blank" rel="noopener noreferrer">Mở bài gốc trên TikTok</a></p>
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
