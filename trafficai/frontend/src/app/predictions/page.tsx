'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react';
import { useAccount } from '@/app/AccountContext';

function PredictionsContent() {
    const searchParams = useSearchParams();
    const campaignIdParam = searchParams.get('campaign');
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [selectedCampaign, setSelectedCampaign] = useState<string>(campaignIdParam || '');
    const [prediction, setPrediction] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [loadingCampaigns, setLoadingCampaigns] = useState(true);
    const { selectedAccountId } = useAccount();

    useEffect(() => {
        setLoadingCampaigns(true);
        api.getCampaigns(selectedAccountId || undefined)
            .then((c) => {
                setCampaigns(c);
                if (campaignIdParam) loadPrediction(campaignIdParam);
            })
            .catch(console.error)
            .finally(() => setLoadingCampaigns(false));
    }, [selectedAccountId, campaignIdParam]);

    async function loadPrediction(campaignId: string) {
        setLoading(true);
        setPrediction(null);
        try {
            const data = await api.getPrediction(campaignId);
            setPrediction(data);
        } catch (err: any) {
            alert('Erro: ' + err.message);
        } finally {
            setLoading(false);
        }
    }

    function TrendIcon({ trend }: { trend: string }) {
        switch (trend) {
            case 'up': return <TrendingUp size={18} />;
            case 'down': return <TrendingDown size={18} />;
            default: return <Minus size={18} />;
        }
    }

    function trendClass(trend: string, inverse = false) {
        if (trend === 'up') return inverse ? 'trend-down' : 'trend-up';
        if (trend === 'down') return inverse ? 'trend-up' : 'trend-down';
        return 'trend-stable';
    }

    const metrics = prediction?.predictions ? [
        { key: 'estimated_leads', label: 'Leads Estimados', prefix: '', suffix: '', inverse: false },
        { key: 'estimated_cpa', label: 'CPA Estimado', prefix: 'R$ ', suffix: '', inverse: true },
        { key: 'estimated_roas', label: 'ROAS Estimado', prefix: '', suffix: 'x', inverse: false },
        { key: 'estimated_spend', label: 'Gasto Estimado', prefix: 'R$ ', suffix: '', inverse: true },
        { key: 'estimated_ctr', label: 'CTR Estimado', prefix: '', suffix: '%', inverse: false },
    ] : [];

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <TrendingUp size={28} style={{ color: 'var(--accent-cyan)' }} />
                        Previsões
                    </h1>
                    <p>Estimativas de performance para os próximos 7 dias</p>
                </div>
            </div>

            {/* Seletor de Campanha */}
            <div className="card" style={{ marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                    className="form-input"
                    value={selectedCampaign}
                    onChange={(e) => setSelectedCampaign(e.target.value)}
                    style={{ flex: 1, minWidth: '200px' }}
                >
                    <option value="">Selecione uma campanha</option>
                    {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
                <button
                    className="btn btn-primary"
                    disabled={!selectedCampaign || loading}
                    onClick={() => loadPrediction(selectedCampaign)}
                >
                    {loading ? <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : <ArrowRight size={16} />}
                    Gerar Previsão
                </button>
            </div>

            {/* Resultados */}
            {prediction && (
                <>
                    <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                        <span>Campanha: <strong style={{ color: 'var(--text-primary)' }}>{prediction.campaign_name}</strong></span>
                        <span>•</span>
                        <span>Período: <strong>Próximos 7 dias</strong></span>
                        <span>•</span>
                        <span>Pontos de dados: <strong>{prediction.data_points}</strong></span>
                    </div>

                    <div className="stats-grid">
                        {metrics.map((m) => {
                            const pred = prediction.predictions[m.key];
                            if (!pred) return null;
                            return (
                                <div key={m.key} className="card prediction-card" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                                    <span className="stat-label">{m.label}</span>
                                    <div className="prediction-value">
                                        {m.prefix}{pred.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}{m.suffix}
                                    </div>
                                    <div className={`trend-indicator ${trendClass(pred.trend, m.inverse)}`}>
                                        <TrendIcon trend={pred.trend} />
                                        <span>{pred.trend === 'up' ? 'Subindo' : pred.trend === 'down' ? 'Caindo' : 'Estável'}</span>
                                    </div>
                                    <div style={{
                                        marginTop: '8px',
                                        width: '100%',
                                        height: '4px',
                                        background: 'var(--bg-input)',
                                        borderRadius: '2px',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${pred.confidence}%`,
                                            background: pred.confidence > 60 ? 'var(--accent-green)' : pred.confidence > 30 ? 'var(--accent-yellow)' : 'var(--accent-red)',
                                            borderRadius: '2px',
                                            transition: 'width 0.5s ease',
                                        }} />
                                    </div>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                        Confiança: {pred.confidence}%
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {!prediction && !loading && (
                <div className="card empty-state">
                    <TrendingUp size={48} style={{ margin: '0 auto 16px', color: 'var(--accent-cyan)', opacity: 0.4 }} />
                    <h3>Selecione uma campanha</h3>
                    <p>Escolha uma campanha acima para ver previsões de performance</p>
                </div>
            )}
        </div>
    );
}

export default function PredictionsPage() {
    return (
        <Suspense fallback={
            <div className="fade-in">
                <div className="page-header"><div><h1>Previsões</h1></div></div>
                <div className="loading-spinner"><div className="spinner" /></div>
            </div>
        }>
            <PredictionsContent />
        </Suspense>
    );
}
