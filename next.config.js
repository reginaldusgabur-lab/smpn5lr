/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development'
});

const nextConfig = {
  // Konfigurasi Next.js lainnya bisa ditambahkan di sini jika perlu
};

module.exports = withPWA(nextConfig);
