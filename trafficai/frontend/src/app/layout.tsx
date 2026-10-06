import type { Metadata, Viewport } from "next";
import { Providers } from "./Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrafficAI — Inteligência para Tráfego Pago",
  description: "Plataforma inteligente para gestores de tráfego pago. Analise campanhas, detecte problemas e otimize resultados com IA.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TrafficAI",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#ff6b35",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <Providers>
          {children}
        </Providers>
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').then((reg) => {
                // Força atualização do SW e reload se houver nova versão
                reg.addEventListener('updatefound', () => {
                  const newWorker = reg.installing;
                  if (newWorker) {
                    newWorker.addEventListener('statechange', () => {
                      if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                        // Nova versão ativada — recarrega pra pegar o bundle novo
                        window.location.reload();
                      }
                    });
                  }
                });
                // Verifica atualizações a cada 60s
                setInterval(() => reg.update(), 60000);
              }).catch(() => {});

              // Se há um SW controlando mas não é o v5, força unregister + reload
              if (navigator.serviceWorker.controller) {
                fetch('/sw.js').then(r => r.text()).then(code => {
                  if (!code.includes('trafficai-v5')) {
                    navigator.serviceWorker.getRegistrations().then(regs => {
                      regs.forEach(r => r.unregister());
                    }).then(() => window.location.reload());
                  }
                }).catch(() => {});
              }
            });
          }
        ` }} />
      </body>
    </html>
  );
}
