
// const withPWA = require("@ducanh2912/next-pwa").default({
//   dest: "public",
//   cacheOnFrontEndNav: true,
//   aggressiveFrontEndNavCaching: false, // Dinonaktifkan untuk mencegah crash pada PWA
//   reloadOnOnline: true,
//   swcMinify: true,
//   disable: false,
//   workboxOptions: {
//     disableDevLogs: true,
//   },
// });

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: "/**",
      },
    ],
  },
  // Tambahkan konfigurasi webpack berikut
  webpack: (config, { isServer }) => {
    // Abaikan modul-modul yang tidak tersedia di browser
    if (!isServer) {
      config.resolve.fallback = {
        net: false,
        fs: false,
        tls: false,
      };
       config.ignoreWarnings = [
         ...(config.ignoreWarnings || []),
         {
           module: /node_modules\/@grpc\/grpc-js\/build\/src\/index\.js/,
         },
         {
           module: /node_modules\/@opentelemetry\/otlp-grpc-exporter-base\/build\/src\/util\.js/,
         },
         {
           module: /node_modules\/@opentelemetry\/otlp-grpc-exporter-base\/build\/src\/index\.js/,
         },
         {
           module: /node_modules\/@opentelemetry\/exporter-trace-otlp-grpc\/build\/src\/OTLPTraceExporter\.js/,
         },
         {
           module: /node_modules\/@opentelemetry\/sdk-node\/build\/src\/TracerProviderWithEnvExporter\.js/,
         },
       ];
    }

    return config;
  },
};

module.exports = nextConfig; // withPWA(nextConfig);
