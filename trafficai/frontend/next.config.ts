import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [
      {
        // Páginas HTML: nunca cachear no navegador/CDN — sempre buscar a versão mais recente.
        // Os chunks estáticos (_next/static/*) continuam com cache longo via hash no nome.
        source: '/((?!_next/static|_next/image|favicon.ico|api/).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, max-age=0, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
    ];
  },
};

export default nextConfig;
