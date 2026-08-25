/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // standalone 출력은 Docker 이미지 빌드에서만 사용(Windows 개발은 심볼릭링크 권한 문제 회피)
  output: process.env.NEXT_STANDALONE === '1' ? 'standalone' : undefined
};

export default nextConfig;
