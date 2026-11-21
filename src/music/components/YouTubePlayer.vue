<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { connectYouTubePlayer, loadYouTubeApi } from '../youtubePlayer.js'

const props = defineProps({ src: { type: String, required: true }, title: String, revealOnMount: Boolean })
const emit = defineEmits(['playing', 'duration', 'time', 'ended', 'error'])
const frame = ref(null)
let controller
let disposed = false

function revealFrame() {
  if (document.hidden || !frame.value) return
  document.removeEventListener('visibilitychange', revealFrame)
  const { top, bottom, height } = frame.value.getBoundingClientRect()
  const visibleHeight = Math.min(bottom, window.innerHeight) - Math.max(top, 0)
  if (visibleHeight <= height / 2) frame.value.scrollIntoView({ block: 'center', behavior: 'instant' })
}

onMounted(async () => {
  if (props.revealOnMount) {
    document.addEventListener('visibilitychange', revealFrame)
    revealFrame()
  }
  try {
    const YT = await loadYouTubeApi()
    if (disposed) return
    controller = connectYouTubePlayer(YT, frame.value, {
      playing: value => emit('playing', value),
      duration: value => emit('duration', value),
      time: value => emit('time', value),
      ended: () => emit('ended'),
      error: message => emit('error', message),
    })
  } catch (error) {
    if (!disposed) emit('error', error.message)
  }
})
onBeforeUnmount(() => {
  disposed = true
  document.removeEventListener('visibilitychange', revealFrame)
  controller?.destroy()
})
defineExpose({ toggle: () => controller?.toggle() || false, restart: () => controller?.restart() })
</script>

<template>
  <iframe ref="frame" class="soundcloud-embed" :src="src" :title="title"
    allow="autoplay; encrypted-media; clipboard-write; fullscreen; picture-in-picture"
    allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
</template>
