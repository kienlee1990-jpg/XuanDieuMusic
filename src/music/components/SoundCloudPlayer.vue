<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({ url: String, title: String, active: Boolean })
const emit = defineEmits(['playing', 'duration', 'ended'])
const frame = ref(null)
const params = new URLSearchParams({ url: props.url, auto_play: String(props.active), visual: 'true', color: '6f9d4b', show_artwork: 'true' })
const src = `https://w.soundcloud.com/player/?${params}`
let widget
let events
let ready = false
let disposed = false
let playing = false
let primed = false
let starting = false

function start() {
  if (!ready) return
  starting = true
  if (primed) {
    widget.seekTo(0)
    widget.setVolume(100)
    primed = false
  }
  widget.getDuration(milliseconds => {
    if (!disposed && props.active && Number.isFinite(milliseconds) && milliseconds > 0) emit('duration', milliseconds / 1000)
  })
  widget.play()
}

function onVisibilityChange() {
  if (!document.hidden && props.active && starting && !playing) widget?.play()
}

watch(() => props.active, active => {
  if (active) start()
  else {
    starting = false
    playing = false
    widget?.pause()
    widget?.seekTo(0)
  }
}, { flush: 'post' })

onMounted(async () => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  try {
    const SC = await loadWidgetApi()
    if (disposed || !frame.value) return
    widget = SC.Widget(frame.value)
    events = SC.Widget.Events
    widget.bind(events.READY, () => {
      ready = true
      if (props.active) start()
      else if (!document.hidden) {
        primed = true
        widget.setVolume(0)
        widget.play()
      }
    })
    widget.bind(events.PLAY, () => {
      if (!props.active) {
        widget.pause()
        return
      }
      starting = false
      playing = true
      emit('playing', true)
    })
    widget.bind(events.PAUSE, () => {
      playing = false
      if (props.active) emit('playing', false)
    })
    widget.bind(events.FINISH, () => {
      if (props.active) emit('ended')
    })
  } catch {
    // The iframe still exposes its own play controls if the script fails.
  }
})

onBeforeUnmount(() => {
  disposed = true
  document.removeEventListener('visibilitychange', onVisibilityChange)
  if (events) {
    for (const event of [events.READY, events.PLAY, events.PAUSE, events.FINISH]) widget.unbind(event)
  }
})

defineExpose({
  toggle() {
    if (!ready) return false
    starting = false
    widget.toggle()
    return true
  },
  restart() { widget?.seekTo(0); widget?.play() },
})
</script>

<script>
let widgetApi

function loadWidgetApi() {
  if (window.SC?.Widget) return Promise.resolve(window.SC)
  widgetApi ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://w.soundcloud.com/player/api.js'
    script.onload = () => window.SC?.Widget ? resolve(window.SC) : reject(new Error('SoundCloud Widget API unavailable'))
    script.onerror = () => reject(new Error('SoundCloud Widget API unavailable'))
    document.head.appendChild(script)
  }).catch(error => { widgetApi = undefined; throw error })
  return widgetApi
}
</script>

<template>
  <iframe ref="frame" class="soundcloud-embed" :src="src" :title="title"
    allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen />
</template>
