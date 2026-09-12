/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@sen/shared'],
  webpack(config) {
    // Shared ESM TypeScript uses .js imports for Node's compiled output.
    config.resolve.extensionAlias = { ...config.resolve.extensionAlias, '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
  // standalone 출력은 Docker 이미지 빌드에서만 사용(Windows 개발은 심볼릭링크 권한 문제 회피)
  output: process.env.NEXT_STANDALONE === '1' ? 'standalone' : undefined
};

export default nextConfig;
