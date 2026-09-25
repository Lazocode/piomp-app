import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Locador de PDFs + IA de Estudos',
  description: 'Workspace inteligente de estudos com Gemini e Supabase',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt">
      <body className="antialiased bg-[#09090b] text-zinc-100">
        {children}
      </body>
    </html>
  );
}