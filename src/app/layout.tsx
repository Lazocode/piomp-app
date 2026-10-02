import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from './context/AuthContext';

export const metadata: Metadata = {
  title: 'Poimp · Caderno de Estudos e Leitura de PDFs',
  description: 'Sua estante privada para leitura de PDFs, anotações e reflexões orientadas',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt">
      <body className="antialiased bg-[#121110] text-stone-200 min-h-dvh font-sans selection:bg-amber-900/60 selection:text-amber-100">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
