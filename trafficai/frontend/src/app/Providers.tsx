'use client';

import { useEffect } from 'react';
import { AccountProvider } from './AccountContext';
import { UserProvider } from './UserContext';
import ImpersonationBanner from '@/components/ImpersonationBanner';
import TableResizer from '@/components/TableResizer';

/**
 * Toca um som de "ka-ching" (venda) usando Web Audio API.
 * Gera o som programaticamente — sem arquivo externo necessário.
 */
function playSaleSound() {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

        // Som de caixa registradora: dois tons rápidos descendentes
        const now = ctx.currentTime;

        // Primeiro tom (mais agudo)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.frequency.setValueAtTime(1200, now);
        osc1.frequency.exponentialRampToValueAtTime(800, now + 0.08);
        gain1.gain.setValueAtTime(0.3, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc1.start(now);
        osc1.stop(now + 0.15);

        // Segundo tom (mais grave, logo após)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.setValueAtTime(900, now + 0.1);
        osc2.frequency.exponentialRampToValueAtTime(600, now + 0.2);
        gain2.gain.setValueAtTime(0.25, now + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc2.start(now + 0.1);
        osc2.stop(now + 0.3);

        // Limpa o contexto após o som terminar
        setTimeout(() => ctx.close(), 500);
    } catch (e) {
        // Silenciosamente ignora se Web Audio não estiver disponível
        console.debug('Sale sound playback failed:', e);
    }
}

export function Providers({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        // Escuta mensagens do service worker para notificações de venda
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data?.type === 'sale-notification') {
                    playSaleSound();
                }
            });
        }

        // Também escuta por notificações via BroadcastChannel (fallback)
        if ('BroadcastChannel' in window) {
            const channel = new BroadcastChannel('trafficai-notifications');
            channel.addEventListener('message', (event) => {
                if (event.data?.type === 'sale') {
                    playSaleSound();
                }
            });
            return () => channel.close();
        }
    }, []);

    return (
        <UserProvider>
            <ImpersonationBanner />
            <TableResizer />
            <AccountProvider>
                {children}
            </AccountProvider>
        </UserProvider>
    );
}
