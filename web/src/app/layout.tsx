import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'FireTV Catalog Quality Checker',
  description:
    'Advanced content-catalog QA tool that detects duplicates and metadata errors in streaming catalogs.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">

      <body className={inter.className} style={{ background: 'var(--bg-primary)' }}>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 ml-60 min-h-screen overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
