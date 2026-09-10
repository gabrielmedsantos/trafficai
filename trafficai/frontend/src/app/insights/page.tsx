'use client';

import { Brain } from 'lucide-react';
import InsightsPanel from '@/components/panels/InsightsPanel';

export default function InsightsPage() {
    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Brain size={28} style={{ color: 'var(--accent-purple)' }} />
                        Insights IA
                    </h1>
                    <p>Análises inteligentes geradas pela IA para suas campanhas — também disponível dentro de Gestor IA</p>
                </div>
            </div>
            <InsightsPanel />
        </div>
    );
}
