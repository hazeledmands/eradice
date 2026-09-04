/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `jose` (v6) ships ESM only. Listing it here is what makes next/jest
  // transform it instead of skipping it with the rest of node_modules.
  transpilePackages: ['jose'],
  // Was `output: 'export'` with `distDir: 'build'`, deploying to Netlify as a
  // static bundle that talked to Supabase straight from the browser. eradice
  // now serves its own API, so it needs a server: `standalone` emits
  // .next/standalone with a minimal node_modules, which is what the container
  // image runs as `node server.js`.
  output: 'standalone',
  images: {
    // No image optimizer in the container (it would need sharp and a writable
    // cache directory, and the pod runs read-only).
    unoptimized: true,
  },
}

module.exports = nextConfig

