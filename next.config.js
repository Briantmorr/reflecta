/** @type {import('next').NextConfig} */
const isDevServer = process.env.npm_lifecycle_event === 'dev'

const nextConfig = {
  distDir: isDevServer ? '.next-dev' : '.next',
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
}

module.exports = nextConfig
