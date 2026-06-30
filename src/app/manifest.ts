import { type MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: 'espenli-absensi-v1',
    name: 'E-SPENLI',
    short_name: 'E-SPENLI',
    description: 'Aplikasi Absensi Digital Modern SMPN 5 Langke Rembong',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FFFFFF',
    theme_color: '#3F51B5',
    icons: [
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
    ],
  }
}
