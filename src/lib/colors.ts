export const SPEAKER_COLORS = [
  '#7F77DD', // purple (primary)
  '#1D9E75', // teal
  '#D85A30', // orange
  '#BA7517', // amber
  '#378ADD', // blue
]

export function speakerColor(index: number): string {
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length]
}
