export const musicGenres = [
  { value: 'nostalgia', label: 'Nhạc hoài niệm' },
  { value: 'ai', label: 'Nhạc AI' },
  { value: 'tiktok', label: 'Nhạc TikTok' },
  { value: 'sentimental', label: 'Nhạc trữ tình' },
  { value: 'chill', label: 'Nhạc chill' },
] as const

export type MusicGenre = typeof musicGenres[number]['value']
