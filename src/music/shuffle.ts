export function shuffleSongs<T>(songs: readonly T[]): T[] {
  const shuffled = [...songs]
  for (let index = shuffled.length - 1; index > 0; index--) {
    const otherIndex = Math.floor(Math.random() * (index + 1))
    const song = shuffled[index]
    shuffled[index] = shuffled[otherIndex]
    shuffled[otherIndex] = song
  }
  return shuffled
}
