
import { type MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'E-SPENLI Absensi',
    short_name: 'E-SPENLI',
    description: 'Aplikasi Absensi Digital untuk SMPN 5 LANGKE REMBONG',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#3F51B5',
    scope: '/',
    orientation: 'portrait',
    icons: [
      {
        src: '/logo-3d-v2.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/logo-3d-v2.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
       {
        src: '/logo-3d-v2.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/logo-3d-v2.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
