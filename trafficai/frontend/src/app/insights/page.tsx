'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Brain, AlertTriangle, CheckCircle, XCircle, Info, MessageCircle, ShoppingCart, Users, MousePointerClick, Megaphone, Target } from 'lucide-react';
import { useAccount } from '@/app/AccountContext';

export default function InsightsPage() {
    const [analyses, setAnalyses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { selectedAccountId } = useAccount();

    useEffect(() => {
        setLoading(true);
        Promise.all([
            api.getAnalyses(),
            api.getCampaigns(selectedAccountId || undefined)
        ])
            .then(([allAnalyses, accountCampaigns]) => {
                if (selectedAccountId) {
                    const campaignIds = new Set(accountCampaigns.map(c => c.id));
                    setAnalyses(allAnalyses.filter(a => campaignIds.has(a.campaign_id)));
                } else {
                    setAnalyses(allAnalyses);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [selectedAccountId]);

    function getRiskClass(score: number) {
        if (score <= 30) return 'risk-low';
        if (score <= 60) return 'risk-medium';
        return 'risk-high';
    }

    function getStatusIcon(status: string) {
        switch (status) {
            case 'excelente': return <CheckCircle size={18} color="var(--accent-green)" />;
            case 'bom': return <Info size={18} color="var(--accent-blue)" />;
            case 'alerta': return <AlertTriangle size={18} color="var(--accent-yellow)" />;
            case 'critico': return <XCircle size={18} color="var(--accent-red)" />;
            default: return <Info size={18} />;
        }
    }

    function getStatusBadge(status: string) {
        switch (status) {
            case 'excelente': return 'badge-green';
            case 'bom': return 'badge-blue';
            case 'alerta': return 'badge-yellow';
            case 'critico': return 'badge-red';
            default: return 'badge-blue';
        }
    }

    function getObjectiveInfo(objective: string): { label: string; icon: React.ReactNode; color: string } {
        const obj = (objective || '').toUpperCase();
        if (obj.includes('MESSAGES') || obj.includes('CONVERSATIONS') || obj.includes('OUTCOME_ENGAGEMENT')) {
            return { label: 'Mensagens', icon: <MessageCircle size={12} />, color: 'var(--accent-green)' };
        }
        if (obj.includes('SALES') || obj.includes('PURCHASE') || obj.includes('OUTCOME_SALES')) {
            return { label: 'Vendas', icon: <ShoppingCart size={12} />, color: 'var(--accent-purple)' };
        }
        if (obj.includes('LEAD') || obj.includes('OUTCOME_LEADS')) {
            return { label: 'Leads', icon: <Target size={12} />, color: 'var(--accent-blue)' };
        }
        if (obj.includes('TRAFFIC') || obj.includes('LINK_CLICKS') || obj.includes('OUTCOME_TRAFFIC')) {
            return { label: 'Tráfego', icon: <MousePointerClick size={12} />, color: 'var(--accent-yellow)' };
        }
        if (obj.includes('AWARENESS') || obj.includes('REACH') || obj.includes('OUTCOME_AWARENESS')) {
            return { label: 'Alcance', icon: <Megaphone size={12} />, color: '#f97316' };
        }
        if (obj.includes('ENGAGEMENT')) {
            return { label: 'Engajamento', icon: <Users size={12} />, color: '#8b5cf6' };
        }
        return { label: objective || 'N/A', icon: <Brain size={12} />, color: 'var(--text-muted)' };
    }

    if (loading) {
        return (
            <div className="fade-in">
                <div className="page-header"><div><h1>Insights IA</h1></div></div>
                <div className="loading-spinner"><div className="spinner" /></div>
            </div>
        );
    }

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Brain size={28} style={{ color: 'var(--accent-purple)' }} />
                        Insights IA
                    </h1>
                    <p>Análises inteligentes geradas pela IA para suas campanhas</p>
                </div>
            </div>

            {analyses.length === 0 ? (
                <div className="card empty-state">
                    <Brain size={48} style={{ margin: '0 auto 16px', color: 'var(--accent-purple)', opacity: 0.5 }} />
                    <h3>Nenhuma análise ainda</h3>
                    <p>Vá para a página de Campanhas e clique em &quot;Analisar&quot; para gerar insights</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {analyses.map((analysis) => (
                        <div key={analysis.id} className="card" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                            {/* Risk Gauge */}
                            <div className={`risk-gauge ${getRiskClass(analysis.risk_score)}`}>
                                {analysis.risk_score}
                            </div>

                            {/* Content */}
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                    <h3 style={{ fontSize: '16px', fontWeight: 600 }}>
                                        {analysis.campaign_name || 'Campanha'}
                                    </h3>
                                    <span className={`badge ${getStatusBadge(analysis.status)}`}>
                                        {getStatusIcon(analysis.status)}
                                        {analysis.status?.toUpperCase()}
                                    </span>
                                    {analysis.campaign_objective && (() => {
                                        const obj = getObjectiveInfo(analysis.campaign_objective);
                                        return (
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                                                background: `${obj.color}18`, color: obj.color,
                                                border: `1px solid ${obj.color}30`,
                                            }}>
                                                {obj.icon} {obj.label}
                                            </span>
                                        );
                                    })()}
                                    <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: 'auto' }}>
                                        {analysis.account_name && <span style={{ marginRight: '8px' }}>{analysis.account_name}</span>}
                                        {new Date(analysis.created_at).toLocaleString('pt-BR')}
                                    </span>
                                </div>

                                <div style={{ marginBottom: '12px' }}>
                                    <h4 style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Diagnóstico
                                    </h4>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6' }}>
                                        {analysis.analysis}
                                    </p>
                                </div>

                                {analysis.recommendation && (
                                    <div style={{
                                        padding: '12px 16px',
                                        background: 'rgba(59,130,246,0.08)',
                                        border: '1px solid rgba(59,130,246,0.15)',
                                        borderRadius: 'var(--radius-sm)',
                                    }}>
                                        <h4 style={{ fontSize: '13px', color: 'var(--accent-blue)', marginBottom: '4px' }}>
                                            💡 Ação Recomendada
                                        </h4>
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                                            {analysis.recommendation}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
