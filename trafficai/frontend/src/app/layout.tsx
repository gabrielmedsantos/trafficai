import type { Metadata } from "next";
import { Providers } from "./Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrafficAI — Inteligência para Tráfego Pago",
  description: "Plataforma inteligente para gestores de tráfego pago. Analise campanhas, detecte problemas e otimize resultados com IA.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
