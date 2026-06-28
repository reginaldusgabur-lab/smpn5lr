
const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: false, // Diubah ke false untuk mencegah reload mendadak saat sinyal tidak stabil
  swcMinify: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    // Tetap false agar PwaUpdater bisa memicu sinkronisasi secara manual/proaktif
    skipWaiting: false, 
    clientsClaim: true,
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "google-fonts",
          expiration: {
            maxEntries: 4,
            maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
          },
        },
      },
      {
        urlPattern: /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "static-font-assets",
          expiration: {
            maxEntries: 4,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          },
        },
      },
      {
        urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "static-image-assets",
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
    ],
  },
});

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
  webpack: (config, { isServer }) => {
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

module.exports = withPWA(nextConfig);
