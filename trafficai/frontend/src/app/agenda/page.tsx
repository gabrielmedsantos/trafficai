'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { List, CalendarRange } from 'lucide-react';
import AgendaListPanel from '@/components/panels/AgendaListPanel';
import AgendaCalendarPanel from '@/components/panels/AgendaCalendarPanel';

// Agenda e Rotina eram duas páginas mostrando essencialmente a mesma coisa —
// tarefas/rotinas e compromissos — só que em visualizações diferentes (lista
// de hoje/semana vs. grade de calendário por hora). Viraram uma página só,
// com alternância de vista, em vez de dois itens separados no menu.
export default function AgendaPage() {
    return (
        <Suspense fallback={<div style={{ padding: 32, color: 'var(--text-muted)' }}>Carregando…</div>}>
            <AgendaViewSwitcher />
        </Suspense>
    );
}

function AgendaViewSwitcher() {
    const searchParams = useSearchParams();
    const [view, setView] = useState<'lista' | 'calendario'>(
        searchParams.get('view') === 'calendario' ? 'calendario' : 'lista'
    );

    return (
        // Margem negativa cancela o padding do .main-content pra essa página
        // poder ocupar a tela inteira quando a vista de calendário estiver ativa.
        <div style={{ margin: '-32px -40px', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flexShrink: 0, display: 'flex', gap: 4, padding: '20px 40px 0' }}>
                <button
                    onClick={() => setView('lista')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 7, padding: '8px 4px', marginRight: 20, marginBottom: -1,
                        background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: 13.5, fontWeight: 600, borderBottom: '2px solid transparent',
                        color: view === 'lista' ? 'var(--text-primary)' : 'var(--text-muted)',
                        borderBottomColor: view === 'lista' ? 'var(--primary)' : 'transparent',
                    }}
                >
                    <List size={14} /> Lista
                </button>
                <button
                    onClick={() => setView('calendario')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 7, padding: '8px 4px', marginRight: 20, marginBottom: -1,
                        background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: 13.5, fontWeight: 600, borderBottom: '2px solid transparent',
                        color: view === 'calendario' ? 'var(--text-primary)' : 'var(--text-muted)',
                        borderBottomColor: view === 'calendario' ? 'var(--primary)' : 'transparent',
                    }}
                >
                    <CalendarRange size={14} /> Calendário
                </button>
            </div>

            <div style={{ flex: 1, overflow: 'hidden', borderTop: '1px solid var(--border)', marginTop: 12 }}>
                {view === 'lista' ? (
                    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 40px 32px' }}>
                        <AgendaListPanel />
                    </div>
                ) : (
                    <AgendaCalendarPanel />
                )}
            </div>
        </div>
    );
}
