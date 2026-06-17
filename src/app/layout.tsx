import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SocialMirror — Understand how you show up in conversation',
  description: 'Real-time speaker diarization, AI transcription, and conversation coaching — free, in your browser.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
