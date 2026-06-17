import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Required for @xenova/transformers WASM + Web Workers
  webpack: (config) => {
    config.resolve.fallback = { fs: false, path: false, crypto: false }
    return config
  },
  // Allow the transformers.js CDN for model fetching
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
