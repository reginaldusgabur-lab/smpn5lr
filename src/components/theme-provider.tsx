'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ThemeProviderProps } from 'next-themes';

// Impor hook useTheme langsung dari next-themes agar komponen lain bisa menggunakannya.
export { useTheme } from 'next-themes';

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      // Atribut untuk diterapkan ke elemen <html> (misalnya, class="dark")
      attribute="class"
      // Tema default jika tidak ada yang disimpan di localStorage
      defaultTheme="light"
      // Aktifkan untuk memperbarui tema berdasarkan preferensi sistem operasi
      enableSystem
      // Nonaktifkan transisi CSS saat mengganti tema untuk mencegah kedipan
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
