'use client';

import TemplatesPanel from '@/components/panels/TemplatesPanel';

export default function TemplatesPage() {
    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        📚 Templates
                    </h1>
                    <p>Biblioteca de mensagens reutilizáveis — também disponível dentro de Diário WhatsApp</p>
                </div>
            </div>
            <TemplatesPanel />
        </div>
    );
}
