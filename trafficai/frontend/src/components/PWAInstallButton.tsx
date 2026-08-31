'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// iOS Safari nunca dispara 'beforeinstallprompt' (API não existe lá) — a única
// forma de instalar é manual via Compartilhar → Adicionar à Tela de Início.
// Sem esse detect o botão simplesmente nunca aparecia em iPhone/iPad.
function isIosSafari(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && (navigator as any).maxTouchPoints > 1);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|opios|chrome|android/i.test(ua);
    return isIos && isSafari;
}

/**
 * Botão "Instalar App" — cobre os dois fluxos de instalação de PWA:
 * - Chrome/Edge/Brave (desktop e Android): dispara o prompt nativo via
 *   'beforeinstallprompt'.
 * - iOS Safari: não existe prompt programático, então mostra instruções
 *   de como adicionar manualmente à Tela de Início.
 *
 * Se esconde se o app já está rodando em modo standalone (instalado).
 */
export default function PWAInstallButton() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isStandalone, setIsStandalone] = useState(false);
    const [isIos, setIsIos] = useState(false);
    const [showIosHint, setShowIosHint] = useState(false);

    useEffect(() => {
        // Detecta se já foi instalado (rodando como app standalone)
        const mq = window.matchMedia('(display-mode: standalone)');
        const standalone = mq.matches || (window.navigator as any).standalone === true;
        setIsStandalone(standalone);
        setIsIos(isIosSafari());

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

    if (isStandalone) return null;
    if (!deferredPrompt && !isIos) return null;

    const handleInstall = async () => {
        if (isIos) {
            setShowIosHint(true);
            return;
        }
        if (!deferredPrompt) return;
        try {
            await deferredPrompt.prompt();
            const choice = await deferredPrompt.userChoice;
            if (choice.outcome === 'accepted') {
                setDeferredPrompt(null);
            }
        } catch { /* usuário cancelou ou navegador rejeitou */ }
    };

    return (
        <>
            <button
                onClick={handleInstall}
                className="btn btn-secondary btn-sm"
                type="button"
                style={{ display: 'flex', alignItems: 'center', gap: '7px' }}
                title="Instalar o TrafficAI como aplicativo no seu computador ou celular"
            >
                <Download size={14} strokeWidth={2} />
                Instalar App
            </button>
            {showIosHint && (
                <div
                    onClick={() => setShowIosHint(false)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{ background: 'var(--bg-card, #111726)', width: '100%', maxWidth: 420, padding: '22px 20px 26px', borderRadius: '16px 16px 0 0', border: '1px solid var(--border-light, #1e2942)', borderBottom: 'none' }}
                    >
                        <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Instalar no iPhone/iPad</p>
                        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-muted, #94a3b8)', marginBottom: 16 }}>
                            1. Toque no ícone de <strong>Compartilhar</strong> (□↑) na barra do Safari<br />
                            2. Escolha <strong>&quot;Adicionar à Tela de Início&quot;</strong><br />
                            3. Toque em <strong>Adicionar</strong>
                        </p>
                        <button
                            onClick={() => setShowIosHint(false)}
                            className="btn btn-primary"
                            type="button"
                            style={{ width: '100%', padding: '10px 0' }}
                        >
                            Entendi
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
