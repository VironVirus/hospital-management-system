const nextConfig = {
  compress: true,
  eslint: {
    ignoreDuringBuilds: true
  },
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"]
  }
};

export default nextConfig;
