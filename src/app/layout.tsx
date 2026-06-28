import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase';
import { ThemeProvider } from "@/components/theme-provider";
import PwaInstaller from '@/components/pwa-installer';
import PwaUpdater from '@/components/pwa-updater';

export const metadata: Metadata = {
  title: 'E-SPENLI',
  description: 'Aplikasi Absensi Digital untuk SMPN 5 Langke Rembong',
  manifest: '/manifest.json',
  applicationName: 'E-SPENLI',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'E-SPENLI',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: '/logo-3d-v2.png',
    apple: '/logo-3d-v2.png',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'application-name': 'E-SPENLI',
    'apple-mobile-web-app-title': 'E-SPENLI',
    'theme-color': '#FFFFFF',
    'msapplication-navbutton-color': '#FFFFFF',
    'apple-mobile-web-app-status-bar-style': 'default',
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#FFFFFF',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/logo-3d-v2.png" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="font-body antialiased bg-background text-foreground" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <FirebaseClientProvider>
            {children}
          </FirebaseClientProvider>
          <Toaster />
          <PwaInstaller />
          <PwaUpdater />
        </ThemeProvider>
      </body>
    </html>
  );
}