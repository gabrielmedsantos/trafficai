'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Palette, Send, Star, AlertTriangle, Lightbulb, ThumbsUp, ThumbsDown } from 'lucide-react';

export default function CreativePage() {
    const [text, setText] = useState('');
    const [context, setContext] = useState('');
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    async function handleAnalyze() {
        if (!text.trim()) return;
        setLoading(true);
        setResult(null);
        try {
            const data = await api.analyzeCreativeText(text, context);
            setResult(data);
        } catch (err: any) {
            alert('Erro: ' + err.message);
        } finally {
            setLoading(false);
        }
    }

    function ScoreBar({ value, label, color }: { value: number; label: string; color: string }) {
        return (
            <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color }}>{value}/100</span>
                </div>
                <div style={{ height: '8px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                        height: '100%',
                        width: `${value}%`,
                        background: color,
                        borderRadius: '4px',
                        transition: 'width 0.6s ease',
                    }} />
                </div>
            </div>
        );
    }

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Palette size={28} style={{ color: 'var(--accent-orange)' }} />
                        Análise de Criativos
                    </h1>
                    <p>Analise textos de anúncios com inteligência artificial</p>
                </div>
            </div>

            <div className="grid-2">
                {/* Input */}
                <div className="card">
                    <h3 style={{ marginBottom: '20px', fontSize: '16px', fontWeight: 600 }}>
                        Texto do Anúncio
                    </h3>

                    <div className="form-group">
                        <label className="form-label">Texto principal do criativo</label>
                        <textarea
                            className="form-input"
                            placeholder="Cole aqui o texto do seu anúncio, copy, headline ou descrição..."
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            style={{ minHeight: '160px' }}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Contexto adicional (opcional)</label>
                        <input
                            className="form-input"
                            placeholder="Ex: Produto de emagrecimento, público feminino 25-45 anos"
                            value={context}
                            onChange={(e) => setContext(e.target.value)}
                            style={{ width: '100%' }}
                        />
                    </div>

                    <button
                        className="btn btn-primary"
                        onClick={handleAnalyze}
                        disabled={loading || !text.trim()}
                        style={{ width: '100%', justifyContent: 'center', padding: '14px' }}
                    >
                        {loading ? (
                            <div className="spinner" style={{ width: '18px', height: '18px', borderWidth: '2px' }} />
                        ) : (
                            <>
                                <Send size={16} /> Analisar com IA
                            </>
                        )}
                    </button>
                </div>

                {/* Results */}
                <div>
                    {result ? (
                        <div className="card slide-in">
                            <h3 style={{ marginBottom: '24px', fontSize: '16px', fontWeight: 600 }}>
                                Resultado da Análise
                            </h3>

                            <ScoreBar value={result.forca_hook} label="Força do Hook" color="var(--accent-blue)" />
                            <ScoreBar value={result.clareza_oferta} label="Clareza da Oferta" color="var(--accent-green)" />
                            <ScoreBar value={result.alinhamento_publico} label="Alinhamento com Público" color="var(--accent-purple)" />
                            <ScoreBar value={result.probabilidade_fadiga} label="Probabilidade de Fadiga" color="var(--accent-red)" />

                            <div style={{ marginTop: '24px' }}>
                                <div style={{
                                    padding: '16px',
                                    background: 'rgba(16,185,129,0.08)',
                                    border: '1px solid rgba(16,185,129,0.15)',
                                    borderRadius: 'var(--radius-sm)',
                                    marginBottom: '12px',
                                }}>
                                    <h4 style={{ fontSize: '13px', color: 'var(--accent-green)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <ThumbsUp size={14} /> Pontos Fortes
                                    </h4>
                                    <ul style={{ paddingLeft: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                                        {result.pontos_fortes?.map((p: string, i: number) => (
                                            <li key={i} style={{ marginBottom: '4px' }}>{p}</li>
                                        ))}
                                    </ul>
                                </div>

                                <div style={{
                                    padding: '16px',
                                    background: 'rgba(239,68,68,0.08)',
                                    border: '1px solid rgba(239,68,68,0.15)',
                                    borderRadius: 'var(--radius-sm)',
                                    marginBottom: '12px',
                                }}>
                                    <h4 style={{ fontSize: '13px', color: 'var(--accent-red)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <ThumbsDown size={14} /> Pontos Fracos
                                    </h4>
                                    <ul style={{ paddingLeft: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                                        {result.pontos_fracos?.map((p: string, i: number) => (
                                            <li key={i} style={{ marginBottom: '4px' }}>{p}</li>
                                        ))}
                                    </ul>
                                </div>

                                <div style={{
                                    padding: '16px',
                                    background: 'rgba(59,130,246,0.08)',
                                    border: '1px solid rgba(59,130,246,0.15)',
                                    borderRadius: 'var(--radius-sm)',
                                }}>
                                    <h4 style={{ fontSize: '13px', color: 'var(--accent-blue)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Lightbulb size={14} /> Sugestões de Melhoria
                                    </h4>
                                    <ul style={{ paddingLeft: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                                        {result.sugestoes?.map((p: string, i: number) => (
                                            <li key={i} style={{ marginBottom: '4px' }}>{p}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {result.avaliacao_geral && (
                                <div style={{ marginTop: '16px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                                    <h4 style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Avaliação Geral</h4>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6' }}>
                                        {result.avaliacao_geral}
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="card empty-state">
                            <Palette size={48} style={{ margin: '0 auto 16px', color: 'var(--accent-orange)', opacity: 0.4 }} />
                            <h3>Analise seus criativos</h3>
                            <p>Cole o texto do seu anúncio e receba análises detalhadas com sugestões de melhoria</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
