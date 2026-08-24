'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Botão "Instalar App" — só aparece quando o navegador oferece o prompt
 * de PWA (Chrome, Edge, Brave desktop; Android Chrome; alguns iOS via Safari
 * "Adicionar à tela de início" que é manual).
 *
 * Também se esconde se o app já está rodando em modo standalone (instalado).
 */
export default function PWAInstallButton() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isStandalone, setIsStandalone] = useState(false);

    useEffect(() => {
        // Detecta se já foi instalado (rodando como app standalone)
        const mq = window.matchMedia('(display-mode: standalone)');
        const standalone = mq.matches || (window.navigator as any).standalone === true;
        setIsStandalone(standalone);

        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
        };
        window.addEventListener('beforeinstallprompt', handler);

        const installed = () => {
            setDeferredPrompt(null);
            setIsStandalone(true);
        };
        window.addEventListener('appinstalled', installed);

        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
            window.removeEventListener('appinstalled', installed);
        };
    }, []);

    if (isStandalone || !deferredPrompt) return null;

    const handleInstall = async () => {
        try {
            await deferredPrompt.prompt();
            const choice = await deferredPrompt.userChoice;
            if (choice.outcome === 'accepted') {
                setDeferredPrompt(null);
            }
        } catch { /* usuário cancelou ou navegador rejeitou */ }
    };

    return (
        <button
            onClick={handleInstall}
            className="sidebar-link"
            type="button"
            style={{
                background: 'linear-gradient(90deg, rgba(255,107,53,0.16), rgba(255,107,53,0.04))',
                border: '1px solid rgba(255,107,53,0.28)',
                color: 'var(--primary)',
                fontWeight: 600,
            }}
            title="Instalar o TrafficAI como aplicativo no seu computador ou celular"
        >
            <Download className="icon" strokeWidth={2} />
            <span>Instalar App</span>
        </button>
    );
}
