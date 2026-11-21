import { afterEach, expect, it, vi } from 'vitest'
import { connectYouTubePlayer } from './youtubePlayer'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function createPlayer() {
  const document = new EventTarget()
  document.hidden = true
  let intersect
  vi.stubGlobal('document', document)
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback) { intersect = callback }
    observe() {}
    disconnect() {}
  })

  const player = {
    getDuration: () => 10,
    getCurrentTime: () => 0,
    getPlayerState: vi.fn(() => -1),
    playVideo: vi.fn(),
    destroy: vi.fn(),
  }
  let events
  const YT = {
    PlayerState: { PLAYING: 1, ENDED: 0 },
    Player: function (_frame, options) { events = options.events; return player },
  }
  const ended = vi.fn()
  const controller = connectYouTubePlayer(YT, {}, { duration: vi.fn(), time: vi.fn(), playing: vi.fn(), ended })
  events.onReady({ target: player })
  return { document, player, events, ended, controller, intersect }
}

it('starts the next YouTube video only once the tab and player are visible', () => {
  vi.useFakeTimers()
  const { document, player, controller, intersect } = createPlayer()
  intersect([{ intersectionRatio: 0.6 }])
  expect(player.playVideo).not.toHaveBeenCalled()

  document.hidden = false
  document.dispatchEvent(new Event('visibilitychange'))
  intersect([{ intersectionRatio: 1 }])
  expect(player.playVideo).toHaveBeenCalledTimes(1)
  controller.destroy()
})

it('advances once when a poll finds an ended state before the event arrives', () => {
  vi.useFakeTimers()
  const { player, events, ended, controller } = createPlayer()
  player.getPlayerState.mockReturnValue(0)
  vi.advanceTimersByTime(1000)
  events.onStateChange({ target: player, data: 0 })
  vi.advanceTimersByTime(1000)
  expect(ended).toHaveBeenCalledTimes(1)
  controller.destroy()
})
