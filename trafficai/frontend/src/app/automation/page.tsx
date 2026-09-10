'use client';

import { Zap } from 'lucide-react';
import AutomationPanel from '@/components/panels/AutomationPanel';

export default function AutomationPage() {
    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Zap size={28} style={{ color: 'var(--accent-orange)' }} /> Automações
                    </h1>
                    <p>Regras SE/ENTÃO — também disponível dentro de Campanhas</p>
                </div>
            </div>
            <AutomationPanel />
        </div>
    );
}
