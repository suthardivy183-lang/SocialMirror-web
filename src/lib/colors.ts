export const SPEAKER_COLORS = ['#7F77DD', '#1D9E75', '#D85A30', '#BA7517', '#378ADD']
export const speakerColor = (i: number) => SPEAKER_COLORS[i % SPEAKER_COLORS.length]
