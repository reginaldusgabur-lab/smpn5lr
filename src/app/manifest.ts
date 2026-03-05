import { type MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'E-SPENLI Absensi',
    short_name: 'E-SPENLI',
    description: 'Aplikasi Absensi Digital untuk SMPN 5 LANGKE REMBONG',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#ffffff',
    icons: [
      {
        src: '/logofix.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/logofix.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
       {
        src: '/logofix.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/logofix.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
