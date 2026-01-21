import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
   /* config options here */
   devIndicators: false,
   transpilePackages: [
      '@radas/ui',
      '@radas/utils',
      '@radas/hooks',
      '@radas/types',
      '@radas/config',
      '@radas/api-client',
      '@radas/validation',
   ],
   typescript: {
      ignoreBuildErrors: true, // Temporary: ignore type errors during build
   },
};

export default nextConfig;
