'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/vendas/shared';
import { Flame, TrendingDown, MousePointer2, ScrollText } from 'lucide-react';

interface HeatmapPoint {
  x: number;
  y: number;
  count: number;
}

interface ScrollAnalysis {
  avg_depth: number;
  median_depth: number;
  drop_off_points: number[];
  total_sessions: number;
}

interface TopUrl {
  url: string;
  sessions: number;
  avg_depth: number;
}

export default function BehaviorInsightsPage() {
  const [sources, setSources] = useState<any[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [topUrls, setTopUrls] = useState<TopUrl[]>([]);
  const [selectedUrl, setSelectedUrl] = useState<string>('');
  const [heatmapData, setHeatmapData] = useState<{ clicks: HeatmapPoint[]; total_sessions: number } | null>(null);
  const [scrollAnalysis, setScrollAnalysis] = useState<ScrollAnalysis | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Carrega sources disponíveis
    api.getTrackingSources().then((res: any) => {
      if (res?.success && res.data) {
        setSources(res.data);
        if (res.data.length > 0) {
          setSelectedSource(res.data[0].id);
        }
      } else if (Array.isArray(res)) {
        setSources(res);
        if (res.length > 0) {
          setSelectedSource(res[0].id);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedSource) return;
    setLoading(true);
    // Carrega top URLs
    api.getBehaviorTopUrls(selectedSource, 10).then((res: any) => {
      if (res?.success && res.data) {
        setTopUrls(res.data);
        if (res.data.length > 0) {
          setSelectedUrl(res.data[0].url);
        }
      } else if (Array.isArray(res)) {
        setTopUrls(res);
        if (res.length > 0) {
          setSelectedUrl(res[0].url);
        }
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [selectedSource]);

  useEffect(() => {
    if (!selectedSource || !selectedUrl) return;
    setLoading(true);
    Promise.all([
      api.getBehaviorHeatmap(selectedSource, selectedUrl),
      api.getBehaviorScrollAnalysis(selectedSource, selectedUrl),
    ]).then(([heatmapRes, scrollRes]: any[]) => {
      // API pode retornar {success, data} ou direto o objeto
      if (heatmapRes?.success) setHeatmapData(heatmapRes.data);
      else if (heatmapRes?.clicks) setHeatmapData(heatmapRes);
      if (scrollRes?.success) setScrollAnalysis(scrollRes.data);
      else if (scrollRes?.avg_depth !== undefined) setScrollAnalysis(scrollRes);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [selectedSource, selectedUrl]);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Flame size={28} color="var(--accent-blue)" />
          Insights de Comportamento
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Mapas de calor e análise de engajamento estilo Microsoft Clarity
        </p>
      </div>

      {/* Seletores */}
      <Card style={{ padding: '20px 24px', marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, display: 'block' }}>
              Source
            </label>
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 13,
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
            >
              {sources.map(s => (
                <option key={s.id} value={s.id}>{s.name || s.pixel_id || s.id.slice(0, 8)}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, display: 'block' }}>
              URL
            </label>
            <select
              value={selectedUrl}
              onChange={(e) => setSelectedUrl(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 13,
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
            >
              {topUrls.map(u => (
                <option key={u.url} value={u.url}>
                  {u.url} ({u.sessions} sessões, {Math.round(u.avg_depth)}% scroll)
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>Carregando dados...</div>
      ) : (
        <>
          {/* Stats Cards */}
          {scrollAnalysis && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
              <Card style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <MousePointer2 size={16} color="var(--accent-blue)" />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Sessões</span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{heatmapData?.total_sessions || 0}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Total de visitas</div>
              </Card>
              <Card style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <ScrollText size={16} color="var(--accent-green)" />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Scroll Médio</span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent-green)' }}>{Math.round(scrollAnalysis.avg_depth)}%</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Profundidade média</div>
              </Card>
              <Card style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <TrendingDown size={16} color="var(--accent-yellow)" />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Mediana</span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent-yellow)' }}>{Math.round(scrollAnalysis.median_depth)}%</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>50% dos usuários</div>
              </Card>
              <Card style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <TrendingDown size={16} color="var(--accent-red)" />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Drop-off 75%</span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent-red)' }}>{Math.round(scrollAnalysis.drop_off_points[2] || 0)}%</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Onde 75% abandonam</div>
              </Card>
            </div>
          )}

          {/* Heatmap Visual */}
          {heatmapData && heatmapData.clicks.length > 0 && (
            <Card style={{ padding: '20px 24px', marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Mapa de Calor de Cliques</div>
              <div style={{ position: 'relative', width: '100%', height: 600, background: 'var(--bg-surface-2)', borderRadius: 8, overflow: 'hidden' }}>
                {/* Grid de fundo */}
                <div style={{ position: 'absolute', inset: 0, opacity: 0.1 }}>
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div key={`h-${i}`} style={{ position: 'absolute', left: 0, right: 0, top: `${i * 5}%`, height: 1, background: 'var(--border)' }} />
                  ))}
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div key={`v-${i}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${i * 5}%`, width: 1, background: 'var(--border)' }} />
                  ))}
                </div>
                {/* Pontos de calor */}
                {heatmapData.clicks.map((point, idx) => {
                  const intensity = Math.min(1, point.count / 10); // Normaliza intensidade
                  const size = 20 + intensity * 40; // Tamanho baseado na intensidade
                  return (
                    <div
                      key={idx}
                      title={`${point.count} clique(s) em (${point.x}%, ${point.y}%)`}
                      style={{
                        position: 'absolute',
                        left: `${point.x}%`,
                        top: `${point.y}%`,
                        width: size,
                        height: size,
                        borderRadius: '50%',
                        background: `radial-gradient(circle, rgba(239,68,68,${0.3 + intensity * 0.5}) 0%, rgba(239,68,68,0) 70%)`,
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none',
                      }}
                    />
                  );
                })}
                {/* Legenda */}
                <div style={{ position: 'absolute', bottom: 12, right: 12, background: 'rgba(0,0,0,0.7)', padding: '8px 12px', borderRadius: 6, fontSize: 11, color: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'rgba(239,68,68,0.3)' }} />
                    <span>Poucos cliques</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'rgba(239,68,68,0.8)' }} />
                    <span>Muitos cliques</span>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Scroll Depth Analysis */}
          {scrollAnalysis && (
            <Card style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Análise de Profundidade de Scroll</div>
              <div style={{ position: 'relative', height: 200, background: 'var(--bg-surface-2)', borderRadius: 8, overflow: 'hidden' }}>
                {/* Barra de progresso visual */}
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${scrollAnalysis.avg_depth}%`, background: 'linear-gradient(90deg, rgba(34,197,94,0.3), rgba(34,197,94,0.6))', transition: 'width 0.5s' }} />
                {/* Marcadores de drop-off */}
                {scrollAnalysis.drop_off_points.map((point, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: 'absolute',
                      left: `${point}%`,
                      top: 0,
                      bottom: 0,
                      width: 2,
                      background: idx === 2 ? 'var(--accent-red)' : 'var(--accent-yellow)',
                      opacity: 0.6,
                    }}
                  >
                    <div style={{ position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)', fontSize: 10, fontWeight: 700, color: idx === 2 ? 'var(--accent-red)' : 'var(--accent-yellow)', whiteSpace: 'nowrap' }}>
                      {idx === 0 ? '25%' : idx === 1 ? '50%' : '75%'}
                    </div>
                  </div>
                ))}
                {/* Labels */}
                <div style={{ position: 'absolute', left: 12, top: 12, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  0%
                </div>
                <div style={{ position: 'absolute', right: 12, top: 12, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  100%
                </div>
                <div style={{ position: 'absolute', left: 12, bottom: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                  Média: {Math.round(scrollAnalysis.avg_depth)}% · Mediana: {Math.round(scrollAnalysis.median_depth)}%
                </div>
              </div>
              <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                <strong>Interpretação:</strong> Linhas verticais indicam onde 25%, 50% e 75% dos usuários param de rolar.
                Se a linha vermelha (75%) estiver muito acima (ex: 40%), significa que a maioria dos usuários não vê o conteúdo abaixo dessa marca — considere mover CTAs importantes para cima.
              </div>
            </Card>
          )}

          {/* Empty State */}
          {!heatmapData && !scrollAnalysis && !loading && (
            <Card style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                Nenhum dado de comportamento disponível ainda. Os dados começarão a aparecer após o deploy do pixel atualizado com captura de cliques e scroll depth.
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}