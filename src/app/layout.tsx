import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase';
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: 'E-SPENLI',
  description: 'Aplikasi Absensi Digital untuk SMPN 5 Langke Rembong',
  manifest: '/manifest.webmanifest',
  applicationName: 'E-SPENLI',
  appleWebApp: {
    capable: true,
    // PERBAIKAN: Mengizinkan konten untuk dirender di bawah status bar di iOS saat ditambahkan ke home screen
    statusBarStyle: 'black-translucent',
    title: 'E-SPENLI',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: '/logofix.png',
    apple: '/logofix.png',
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // PERBAIKAN: Memperluas aplikasi ke seluruh layar, termasuk area status bar.
  viewportFit: 'cover',
  // PERBAIKAN: Memastikan warna status bar menyatu dengan latar belakang aplikasi dalam mode terang/gelap.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' }
  ],
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
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
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
        </ThemeProvider>
      </body>
    </html>
  );
}
