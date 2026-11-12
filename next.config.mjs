/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  async redirects() {
    return [
      { source: '/p/nimbus', destination: '/p/umbra', permanent: true },
      { source: '/p/nimbus/', destination: '/p/umbra', permanent: true },
      { source: '/add-protocol', destination: '/add', permanent: true },
    ];
  },
};

export default nextConfig;
