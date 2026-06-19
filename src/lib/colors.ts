// Harmonized with the warm editorial system. Speaker 1 carries the brand
// terracotta ("you"); the rest are sophisticated, distinct, readable on ivory.
export const SPEAKER_COLORS = ['#BC4A30', '#2C7A6B', '#C18A2C', '#4E6796', '#8A567A']
export const speakerColor = (i: number) => SPEAKER_COLORS[i % SPEAKER_COLORS.length]
