'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Eye, Send, CheckSquare, Square,
  ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Info
} from 'lucide-react';

const API = 'http://localhost:3001/api/v1';
const token = () => localStorage.getItem('trafficai_token') || '';

interface Campaign {
  id: string;
  name: string;
  objective: string | null;
  status: string;
  spend: number;
  conversions: number;
  clicks: number;
  impressions: number;
  roas: number;
  ctr: number;
  selected: boolean;
}

interface Report {
  id: string;
  account_name: string;
  type: string;
  period_start: string;
  period_end: string;
  title: string;
  summary: string;
  ai_analysis: string;
  recommendations: string[];
  client_name: string | null;
  client_email: string | null;
  public_token: string;
  custom_note: string | null;
  edited_analysis: string | null;
  edited_recommendations: string[] | null;
  selected_campaign_ids: string[] | null;
  show_campaign_table: boolean;
  show_ai_analysis: boolean;
}

// Mapeamento de objetivos para português
const objectiveLabels: Record<string, string> = {
  OUTCOME_SALES: 'Vendas',
  OUTCOME_LEADS: 'Leads',
  OUTCOME_TRAFFIC: 'Tráfego',
  OUTCOME_ENGAGEMENT: 'Engajamento',
  OUTCOME_APP_PROMOTION: 'App',
  OUTCOME_AWARENESS: 'Reconhecimento',
  OUTCOME_MESSAGES: 'Mensagens',
  LINK_CLICKS: 'Cliques no Link',
  VIDEO_VIEWS: 'Visualizações de Vídeo',
  REACH: 'Alcance',
  BRAND_AWARENESS: 'Reconhecimento de Marca',
  PAGE_LIKES: 'Curtidas na Página',
  POST_ENGAGEMENT: 'Engajamento',
  LEAD_GENERATION: 'Geração de Leads',
  MESSAGES: 'Mensagens',
  CONVERSIONS: 'Conversões',
  PRODUCT_CATALOG_SALES: 'Vendas do Catálogo',
  STORE_VISITS: 'Visitas à Loja',
};

const objectiveGroups: Record<string, string[]> = {
  'Vendas & Conversões': ['OUTCOME_SALES', 'CONVERSIONS', 'PRODUCT_CATALOG_SALES'],
  'Geração de Leads': ['OUTCOME_LEADS', 'LEAD_GENERATION'],
  'Mensagens & Engajamento': ['OUTCOME_MESSAGES', 'MESSAGES', 'OUTCOME_ENGAGEMENT', 'POST_ENGAGEMENT', 'PAGE_LIKES'],
  'Tráfego': ['OUTCOME_TRAFFIC', 'LINK_CLICKS'],
  'Reconhecimento': ['OUTCOME_AWARENESS', 'BRAND_AWARENESS', 'REACH', 'VIDEO_VIEWS', 'STORE_VISITS'],
  'Outros': ['OUTCOME_APP_PROMOTION'],
};

function getGroup(objective: string | null): string {
  if (!objective) return 'Outros';
  for (const [group, objectives] of Object.entries(objectiveGroups)) {
    if (objectives.includes(objective)) return group;
  }
  return 'Outros';
}

export default function EditReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [report, setReport] = useState<Report | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Campos editáveis
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [customNote, setCustomNote] = useState('');
  const [editedAnalysis, setEditedAnalysis] = useState('');
  const [editedRecs, setEditedRecs] = useState<string[]>([]);
  const [showCampaignTable, setShowCampaignTable] = useState(true);
  const [showAiAnalysis, setShowAiAnalysis] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allSelected, setAllSelected] = useState(true);

  const [expandedSections, setExpandedSections] = useState({ campaigns: true, analysis: false, recs: false, note: true });

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [reportRes, campaignsRes] = await Promise.all([
        fetch(`${API}/reports/${id}`, { headers: { Authorization: `Bearer ${token()}` } }),
        fetch(`${API}/reports/${id}/campaigns`, { headers: { Authorization: `Bearer ${token()}` } }),
      ]);
      const reportData = await reportRes.json();
      const campaignsData = await campaignsRes.json();

      if (reportData.success) {
        const r: Report = reportData.data;
        setReport(r);
        setClientName(r.client_name || '');
        setClientEmail(r.client_email || '');
        setCustomNote(r.custom_note || '');
        setEditedAnalysis(r.edited_analysis || r.ai_analysis || '');
        setEditedRecs(r.edited_recommendations || r.recommendations || []);
        setShowCampaignTable(r.show_campaign_table !== false);
        setShowAiAnalysis(r.show_ai_analysis !== false);
      }

      if (campaignsData.success) {
        const camps: Campaign[] = campaignsData.data;
        setCampaigns(camps);
        const initialSelected = new Set(camps.filter(c => c.selected).map(c => c.id));
        setSelectedIds(initialSelected);
        setAllSelected(initialSelected.size === camps.length);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleCampaign = (campaignId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(campaignId)) next.delete(campaignId);
      else next.add(campaignId);
      setAllSelected(next.size === campaigns.length);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      setAllSelected(false);
    } else {
      setSelectedIds(new Set(campaigns.map(c => c.id)));
      setAllSelected(true);
    }
  };

  const selectGroup = (objective: string) => {
    const groupObjectives = objectiveGroups[objective] || [];
    const groupCampaigns = campaigns.filter(c => groupObjectives.includes(c.objective || ''));
    const allGroupSelected = groupCampaigns.every(c => selectedIds.has(c.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      groupCampaigns.forEach(c => {
        if (allGroupSelected) next.delete(c.id);
        else next.add(c.id);
      });
      setAllSelected(next.size === campaigns.length);
      return next;
    });
  };

  const updateRec = (i: number, val: string) => {
    setEditedRecs(prev => prev.map((r, idx) => idx === i ? val : r));
  };

  const addRec = () => setEditedRecs(prev => [...prev, '']);
  const removeRec = (i: number) => setEditedRecs(prev => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    try {
      setSaving(true);
      const body = {
        client_name: clientName || null,
        client_email: clientEmail || null,
        custom_note: customNote || null,
        edited_analysis: editedAnalysis || null,
        edited_recommendations: editedRecs.filter(r => r.trim()),
        selected_campaign_ids: allSelected ? null : Array.from(selectedIds),
        show_campaign_table: showCampaignTable,
        show_ai_analysis: showAiAnalysis,
      };

      const res = await fetch(`${API}/reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        alert('Erro ao salvar: ' + result.error?.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
      <div className="spinner" style={{ width: '40px', height: '40px', borderWidth: '3px' }} />
    </div>
  );

  if (!report) return (
    <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>Relatório não encontrado</div>
  );

  // Agrupa campanhas por objetivo
  const groups: Record<string, Campaign[]> = {};
  campaigns.forEach(c => {
    const g = getGroup(c.objective);
    if (!groups[g]) groups[g] = [];
    groups[g].push(c);
  });

  const toggle = (section: keyof typeof expandedSections) =>
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px', padding: '6px 0' }}>
          <ArrowLeft size={18} /> Voltar
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '2px' }}>Editar Relatório</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            {report.account_name} • {fmtDate(report.period_start)} a {fmtDate(report.period_end)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <a href={`/report/${report.public_token}`} target="_blank" rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ padding: '10px 16px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}>
            <Eye size={16} /> Visualizar
          </a>
          <button className="btn btn-primary" onClick={save} disabled={saving}
            style={{ padding: '10px 18px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Save size={16} /> {saved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Info do cliente */}
      <div className="card-glass" style={{ padding: '20px', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px' }}>👤 Dados do Cliente</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Nome do cliente</label>
            <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Ex: João Silva" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email do cliente</label>
            <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="cliente@email.com" style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Nota personalizada */}
      <div className="card-glass" style={{ padding: '20px', marginBottom: '16px' }}>
        <button onClick={() => toggle('note')} style={sectionToggleStyle}>
          <span style={{ fontSize: '15px', fontWeight: 700 }}>💬 Mensagem Personalizada</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>aparece no topo do relatório do cliente</span>
          {expandedSections.note ? <ChevronUp size={16} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={16} style={{ marginLeft: 'auto' }} />}
        </button>
        {expandedSections.note && (
          <div style={{ marginTop: '14px' }}>
            <textarea value={customNote} onChange={e => setCustomNote(e.target.value)} rows={3}
              placeholder="Ex: Olá! Este mês foi excelente para as campanhas de mensagens. Estamos muito felizes com os resultados e já estamos preparando as próximas ações para aumentar ainda mais as conversões."
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
          </div>
        )}
      </div>

      {/* Seleção de campanhas */}
      <div className="card-glass" style={{ padding: '20px', marginBottom: '16px' }}>
        <button onClick={() => toggle('campaigns')} style={sectionToggleStyle}>
          <span style={{ fontSize: '15px', fontWeight: 700 }}>📋 Campanhas no Relatório</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>{selectedIds.size} de {campaigns.length} selecionadas</span>
          {expandedSections.campaigns ? <ChevronUp size={16} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={16} style={{ marginLeft: 'auto' }} />}
        </button>

        {expandedSections.campaigns && (
          <div style={{ marginTop: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', padding: '10px 12px', background: 'var(--bg-input)', borderRadius: '6px' }}>
              <button onClick={toggleAll} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: allSelected ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                {allSelected ? <CheckSquare size={16} /> : <Square size={16} />} Selecionar todas
              </button>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>|</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Clique no grupo para selecionar/desmarcar por objetivo:</span>
            </div>

            {Object.entries(groups).map(([groupName, groupCampaigns]) => {
              if (!groupCampaigns.length) return null;
              const allGroupSelected = groupCampaigns.every(c => selectedIds.has(c.id));
              const someGroupSelected = groupCampaigns.some(c => selectedIds.has(c.id));
              return (
                <div key={groupName} style={{ marginBottom: '16px' }}>
                  <button onClick={() => selectGroup(groupName)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '8px', padding: 0 }}>
                    {allGroupSelected
                      ? <CheckSquare size={15} color="var(--primary)" />
                      : someGroupSelected
                        ? <CheckSquare size={15} color="var(--text-muted)" />
                        : <Square size={15} color="var(--text-muted)" />}
                    <span style={{ fontSize: '13px', fontWeight: 700, color: allGroupSelected ? 'var(--primary)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{groupName}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>({groupCampaigns.length})</span>
                  </button>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '22px' }}>
                    {groupCampaigns.map(c => (
                      <button key={c.id} onClick={() => toggleCampaign(c.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                          background: selectedIds.has(c.id) ? 'rgba(255, 107, 53,.08)' : 'var(--bg-input)',
                          border: `1px solid ${selectedIds.has(c.id) ? 'rgba(255, 107, 53,.3)' : 'var(--border)'}`,
                          borderRadius: '6px', cursor: 'pointer', textAlign: 'left', width: '100%',
                        }}>
                        {selectedIds.has(c.id)
                          ? <CheckSquare size={15} color="var(--primary)" style={{ flexShrink: 0 }} />
                          : <Square size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selectedIds.has(c.id) ? 'var(--text)' : 'var(--text-muted)' }}>
                            {c.name}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                            {c.objective ? (objectiveLabels[c.objective] || c.objective) : 'Sem objetivo'} •
                            <span style={{ color: c.status === 'ACTIVE' ? '#22c55e' : '#64748b' }}> {c.status === 'ACTIVE' ? 'Ativa' : 'Pausada'}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>
                          <span>{fmt(c.spend)}</span>
                          {c.conversions > 0 && <span>🎯 {c.conversions}</span>}
                          {c.roas > 0 && <span style={{ color: c.roas >= 2 ? '#22c55e' : '#f59e0b' }}>{c.roas.toFixed(1)}x</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Visibilidade da tabela */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg-input)', borderRadius: '6px', marginTop: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Mostrar tabela de campanhas no relatório do cliente</span>
              <Toggle value={showCampaignTable} onChange={setShowCampaignTable} />
            </div>
          </div>
        )}
      </div>

      {/* Análise IA */}
      <div className="card-glass" style={{ padding: '20px', marginBottom: '16px' }}>
        <button onClick={() => toggle('analysis')} style={sectionToggleStyle}>
          <span style={{ fontSize: '15px', fontWeight: 700 }}>🤖 Análise</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>edite ou substitua a análise gerada pela IA</span>
          {expandedSections.analysis ? <ChevronUp size={16} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={16} style={{ marginLeft: 'auto' }} />}
        </button>
        {expandedSections.analysis && (
          <div style={{ marginTop: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                <Info size={12} style={{ display: 'inline', marginRight: '4px' }} />
                Suporta markdown básico: **negrito**, ## Título, - lista
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Mostrar no relatório</span>
                <Toggle value={showAiAnalysis} onChange={setShowAiAnalysis} />
              </div>
            </div>
            <textarea value={editedAnalysis} onChange={e => setEditedAnalysis(e.target.value)} rows={12}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7, fontFamily: 'monospace', fontSize: '13px' }} />
            <button onClick={() => setEditedAnalysis(report.ai_analysis || '')}
              style={{ marginTop: '6px', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', padding: 0 }}>
              ↺ Restaurar análise original da IA
            </button>
          </div>
        )}
      </div>

      {/* Recomendações */}
      <div className="card-glass" style={{ padding: '20px', marginBottom: '24px' }}>
        <button onClick={() => toggle('recs')} style={sectionToggleStyle}>
          <span style={{ fontSize: '15px', fontWeight: 700 }}>🎯 Próximos Passos / Recomendações</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>{editedRecs.length} item(ns)</span>
          {expandedSections.recs ? <ChevronUp size={16} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={16} style={{ marginLeft: 'auto' }} />}
        </button>
        {expandedSections.recs && (
          <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {editedRecs.map((rec, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(255, 107, 53,.2)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                <input value={rec} onChange={e => updateRec(i, e.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder="Recomendação..." />
                <button onClick={() => removeRec(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}>✕</button>
              </div>
            ))}
            <button onClick={addRec}
              style={{ padding: '8px', background: 'var(--bg-input)', border: '1px dashed var(--border)', borderRadius: '6px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px' }}>
              + Adicionar recomendação
            </button>
            <button onClick={() => setEditedRecs(report.recommendations || [])}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
              ↺ Restaurar recomendações da IA
            </button>
          </div>
        )}
      </div>

      {/* Save bottom */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <a href={`/report/${report.public_token}`} target="_blank" rel="noopener noreferrer"
          className="btn btn-secondary"
          style={{ padding: '12px 20px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}>
          <Eye size={16} /> Ver como cliente
        </a>
        <button className="btn btn-primary" onClick={save} disabled={saving}
          style={{ padding: '12px 24px', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Save size={18} /> {saved ? '✓ Salvo!' : saving ? 'Salvando...' : 'Salvar Relatório'}
        </button>
      </div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: value ? 'var(--primary)' : 'var(--border)', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: '3px', left: value ? '22px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left .2s', display: 'block' }} />
    </button>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', display: 'block',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: 'var(--bg)',
  border: '1px solid var(--border)', borderRadius: '6px',
  color: 'var(--text)', fontSize: '14px', outline: 'none',
};

const sectionToggleStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0', background: 'none', border: 'none',
  cursor: 'pointer', padding: 0, width: '100%', color: 'var(--text)',
};
