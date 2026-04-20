'use client';

import { useState, useEffect } from 'react';
import {
  FileText, Plus, Send, Eye, Copy, Check, Trash2,
  Calendar, Settings2, RefreshCw, Edit2, X, MessageCircle,
  Phone, Mail, ChevronDown, ChevronUp, Clock, Download,
  Upload, FileSpreadsheet, AlertCircle,
} from 'lucide-react';
import { useAccount } from '@/app/AccountContext';
import AccountSelect from '@/components/AccountSelect';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const token = () => localStorage.getItem('trafficai_token') || '';

interface Report {
  id: string;
  account_id: string;
  account_name: string;
  type: 'daily' | 'weekly' | 'monthly';
  period_start: string;
  period_end: string;
  title: string;
  summary: string;
  public_token: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  status: 'draft' | 'sent' | 'viewed';
  viewed_count: number;
  sent_at: string | null;
  created_at: string;
}

interface ReportSend {
  id: string;
  channel: 'email' | 'whatsapp';
  recipient: string;
  sent_at: string;
  status: 'sent' | 'failed';
}

interface ReportSettings {
  client_name: string;
  client_email: string;
  client_phone: string;
  daily_enabled: boolean;
  weekly_enabled: boolean;
  monthly_enabled: boolean;
  auto_send_email: boolean;
  auto_send_whatsapp: boolean;
  daily_whatsapp_enabled: boolean;
  agency_name: string;
  custom_message: string;
}

const typeLabel = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal' } as const;
const typeColor = { daily: '#60a5fa', weekly: '#a78bfa', monthly: '#fbbf24' } as const;
const typeBg    = { daily: 'rgba(59,130,246,.12)', weekly: 'rgba(139,92,246,.12)', monthly: 'rgba(245,158,11,.12)' } as const;
const statusCfg = {
  draft:  { label: 'Rascunho',    color: '#94a3b8', bg: 'rgba(100,116,139,.1)',  border: 'rgba(100,116,139,.2)' },
  sent:   { label: 'Enviado',     color: '#34d399', bg: 'rgba(16,185,129,.1)',   border: 'rgba(16,185,129,.25)' },
  viewed: { label: 'Visualizado', color: '#a5b4fc', bg: 'rgba(99,102,241,.1)',   border: 'rgba(99,102,241,.25)' },
} as const;

export default function ReportsPage() {
  const { accounts, selectedAccountId, loading: accountsLoading } = useAccount();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [waLoadingId, setWaLoadingId] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [showGenModal, setShowGenModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showWaModal, setShowWaModal] = useState<{ reportId: string; defaultPhone: string } | null>(null);
  const [filterType, setFilterType] = useState<string>('');
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [sendsMap, setSendsMap] = useState<Record<string, ReportSend[]>>({});
  const [loadingSends, setLoadingSends] = useState<string | null>(null);

  const [genForm, setGenForm] = useState<{ account_id: string; type: 'daily' | 'weekly' | 'monthly'; period_start: string; period_end: string; custom_period: boolean }>({
    account_id: '', type: 'weekly', period_start: '', period_end: '', custom_period: false,
  });

  // Modo "manual": gera relatório de conta não conectada via CSV ou texto livre
  const [genMode, setGenMode] = useState<'connected' | 'manual'>('connected');
  const [manualForm, setManualForm] = useState<{
    input_type: 'csv' | 'text';
    client_name: string;
    client_email: string;
    client_phone: string;
    account_id: string;
    primary_action: '' | 'purchase' | 'lead' | 'message';
    csv_data: string;
    text_data: string;
  }>({
    input_type: 'csv',
    client_name: '', client_email: '', client_phone: '',
    account_id: '', primary_action: '',
    csv_data: '', text_data: '',
  });
  const [manualError, setManualError] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [csvRowCount, setCsvRowCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [settingsForm, setSettingsForm] = useState<ReportSettings>({
    client_name: '', client_email: '', client_phone: '',
    daily_enabled: false, weekly_enabled: true, monthly_enabled: true,
    auto_send_email: false, auto_send_whatsapp: false, daily_whatsapp_enabled: false,
    agency_name: 'Alfamax Digital', custom_message: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [waPhone, setWaPhone] = useState('');

  useEffect(() => { if (!accountsLoading) loadReports(); }, [selectedAccountId, filterType, accountsLoading]);

  const loadReports = async () => {
    try {
      setLoading(true);
      let url = `${API}/reports?limit=100`;
      if (filterType) url += `&type=${filterType}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
      const result = await res.json();
      if (result.success) setReports(result.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadSettings = async (accountId: string) => {
    try {
      const res = await fetch(`${API}/reports/settings/${accountId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const result = await res.json();
      if (result.success && result.data) setSettingsForm(f => ({ ...f, ...result.data }));
    } catch (e) { console.error(e); }
  };

  const loadSends = async (reportId: string) => {
    if (sendsMap[reportId]) return; // já carregado
    try {
      setLoadingSends(reportId);
      const res = await fetch(`${API}/reports/${reportId}/sends`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const result = await res.json();
      if (result.success) setSendsMap(m => ({ ...m, [reportId]: result.data }));
    } catch (e) { console.error(e); }
    finally { setLoadingSends(null); }
  };

  const toggleHistory = async (reportId: string) => {
    if (expandedHistory === reportId) {
      setExpandedHistory(null);
    } else {
      setExpandedHistory(reportId);
      await loadSends(reportId);
    }
  };

  const generateReport = async () => {
    if (!genForm.account_id) return alert('Selecione uma conta');
    try {
      setGenerating(true);
      const res = await fetch(`${API}/reports/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          account_id: genForm.account_id,
          type: genForm.type,
          ...(genForm.custom_period && genForm.period_start && genForm.period_end
            ? { period_start: genForm.period_start, period_end: genForm.period_end }
            : {}),
        }),
      });
      const result = await res.json();
      if (result.success) { setShowGenModal(false); await loadReports(); }
      else alert('Erro: ' + result.error?.message);
    } catch (e: any) { alert('Erro: ' + e.message); }
    finally { setGenerating(false); }
  };

  const readCsvFile = async (file: File) => {
    setManualError('');
    const name = file.name.toLowerCase();
    if (!/\.(csv|tsv|txt)$/.test(name)) {
      if (/\.xlsx?$/.test(name)) {
        setManualError('Excel (XLSX) não é suportado diretamente. No Gerenciador da Meta, escolha "Exportar como CSV" ou salve o arquivo como CSV no Excel.');
      } else {
        setManualError('Formato não suportado. Use CSV, TSV ou TXT.');
      }
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setManualError('Arquivo maior que 10 MB. Exporte um período mais curto.');
      return;
    }
    try {
      // Tenta UTF-8 primeiro; se vier com caractere substituto, refaz como Latin-1 (CSV do Excel BR)
      let text = await file.text();
      if (/\uFFFD/.test(text)) {
        const buf = await file.arrayBuffer();
        text = new TextDecoder('windows-1252').decode(buf);
      }
      const rows = text.split(/\r?\n/).filter(Boolean).length;
      setManualForm(f => ({ ...f, csv_data: text }));
      setCsvFileName(file.name);
      setCsvRowCount(Math.max(0, rows - 1));
    } catch (err: any) {
      setManualError('Falha ao ler o arquivo: ' + (err.message || 'erro desconhecido'));
    }
  };

  const clearCsvUpload = () => {
    setManualForm(f => ({ ...f, csv_data: '' }));
    setCsvFileName('');
    setCsvRowCount(0);
  };

  const generateManualReport = async () => {
    setManualError('');
    const payload: any = {
      type: genForm.type,
      client_name: manualForm.client_name.trim() || undefined,
      client_email: manualForm.client_email.trim() || undefined,
      client_phone: manualForm.client_phone.trim() || undefined,
      account_id: manualForm.account_id || undefined,
      primary_action: manualForm.primary_action || undefined,
    };
    if (manualForm.input_type === 'csv') {
      if (!manualForm.csv_data.trim()) {
        setManualError('Cole o CSV exportado do Gerenciador da Meta.');
        return;
      }
      payload.csv_data = manualForm.csv_data;
    } else {
      if (!manualForm.text_data.trim()) {
        setManualError('Descreva as métricas em texto livre.');
        return;
      }
      payload.text_data = manualForm.text_data;
    }
    if (!payload.account_id && !payload.client_name) {
      setManualError('Informe o nome do cliente OU selecione uma conta.');
      return;
    }
    if (genForm.custom_period && genForm.period_start && genForm.period_end) {
      payload.period_start = genForm.period_start;
      payload.period_end = genForm.period_end;
    }

    try {
      setGenerating(true);
      const res = await fetch(`${API}/reports/generate-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (result.success) {
        setShowGenModal(false);
        setManualForm(f => ({ ...f, csv_data: '', text_data: '' }));
        await loadReports();
      } else {
        setManualError(result.error?.message || 'Erro ao gerar relatório');
      }
    } catch (e: any) {
      setManualError(e.message || 'Erro inesperado');
    } finally {
      setGenerating(false);
    }
  };

  const sendReport = async (reportId: string, email?: string) => {
    const to = email || prompt('Email do cliente:');
    if (!to) return;
    try {
      setSendingId(reportId);
      const res = await fetch(`${API}/reports/${reportId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ email: to }),
      });
      const result = await res.json();
      if (result.success) {
        // Limpa cache de envios para recarregar
        setSendsMap(m => { const nm = { ...m }; delete nm[reportId]; return nm; });
        await loadReports();
      } else alert('Erro ao enviar: ' + result.error?.message);
    } catch (e: any) { alert('Erro: ' + e.message); }
    finally { setSendingId(null); }
  };

  const openWaModal = (report: Report) => {
    setWaPhone(report.client_phone || '');
    setShowWaModal({ reportId: report.id, defaultPhone: report.client_phone || '' });
  };

  const isGroupLink = (v: string) => v.startsWith('https://chat.whatsapp.com/');

  const sendWhatsApp = async () => {
    if (!showWaModal) return;
    const phone = waPhone.trim();
    if (!phone) return alert('Informe o número ou link do grupo');
    try {
      setWaLoadingId(showWaModal.reportId);
      const res = await fetch(`${API}/reports/${showWaModal.reportId}/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ phone, base_url: window.location.origin }),
      });
      const result = await res.json();
      if (result.success) {
        // Se for grupo, copia o link do relatório antes de abrir
        if (result.data.is_group && result.data.public_url) {
          await navigator.clipboard.writeText(result.data.public_url);
        }
        window.open(result.data.wa_link, '_blank', 'noopener,noreferrer');
        setShowWaModal(null);
        setSendsMap(m => { const nm = { ...m }; delete nm[showWaModal.reportId]; return nm; });
        await loadReports();
      } else alert('Erro: ' + result.error?.message);
    } catch (e: any) { alert('Erro: ' + e.message); }
    finally { setWaLoadingId(null); }
  };

  const deleteReport = async (reportId: string) => {
    if (!confirm('Remover este relatório?')) return;
    await fetch(`${API}/reports/${reportId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token()}` },
    });
    await loadReports();
  };

  const copyLink = (publicToken: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/report/${publicToken}`);
    setCopiedToken(publicToken);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const [sendingDailyWa, setSendingDailyWa] = useState(false);

  const sendDailyWhatsAppNow = async () => {
    const accountId = genForm.account_id || selectedAccountId;
    if (!accountId) return alert('Selecione uma conta');
    try {
      setSendingDailyWa(true);
      const res = await fetch(`${API}/reports/daily-whatsapp/send-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ account_id: accountId, phone: settingsForm.client_phone || undefined }),
      });
      const result = await res.json();
      if (result.success) alert('✅ Relatório diário enviado com sucesso!');
      else alert('Erro: ' + result.error?.message);
    } catch (e: any) { alert('Erro: ' + e.message); }
    finally { setSendingDailyWa(false); }
  };

  const saveSettings = async () => {
    const accountId = genForm.account_id || selectedAccountId;
    if (!accountId) return alert('Selecione uma conta');
    try {
      setSavingSettings(true);
      const res = await fetch(`${API}/reports/settings/${accountId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(settingsForm),
      });
      const result = await res.json();
      if (result.success) setShowSettingsModal(false);
      else alert('Erro: ' + result.error?.message);
    } catch (e: any) { alert('Erro: ' + e.message); }
    finally { setSavingSettings(false); }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const fmtDT   = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  /* ── FILTER TABS ── */
  const FILTERS = [
    { value: '',        label: 'Todos' },
    { value: 'daily',   label: 'Diários' },
    { value: 'weekly',  label: 'Semanais' },
    { value: 'monthly', label: 'Mensais' },
  ];

  return (
    <div className="fade-in">

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1>Relatórios</h1>
          <p>Relatórios automáticos por cliente com análise IA</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary btn-sm"
            onClick={() => { setShowSettingsModal(true); if (selectedAccountId) loadSettings(selectedAccountId); }}>
            <Settings2 size={14} /> Configurar
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowGenModal(true)}>
            <Plus size={14} /> Novo Relatório
          </button>
        </div>
      </div>

      {/* ── Filter tabs + refresh ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
        {FILTERS.map(f => (
          <button key={f.value} onClick={() => setFilterType(f.value)}
            style={{
              padding: '5px 14px', borderRadius: '20px', fontSize: '12.5px', fontWeight: 600,
              cursor: 'pointer', border: `1px solid ${filterType === f.value ? 'rgba(99,102,241,.5)' : 'var(--border)'}`,
              background: filterType === f.value ? 'rgba(99,102,241,.12)' : 'transparent',
              color: filterType === f.value ? '#a5b4fc' : 'var(--text-muted)',
              transition: 'all .15s',
            }}>
            {f.label}
          </button>
        ))}
        <button onClick={loadReports}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', fontWeight: 500, padding: '5px 8px', borderRadius: '6px' }}>
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      {/* ── List ── */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '96px', borderRadius: '12px' }} />)}
        </div>
      ) : reports.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '64px 24px', textAlign: 'center' }}>
          <div className="empty-state-icon" style={{ margin: '0 auto 16px' }}>
            <FileText size={24} />
          </div>
          <p style={{ fontSize: '17px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>Nenhum relatório ainda</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', marginBottom: '24px' }}>
            Gere seu primeiro relatório ou configure os relatórios automáticos
          </p>
          <button className="btn btn-primary" onClick={() => setShowGenModal(true)}>
            <Plus size={15} /> Gerar Primeiro Relatório
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {reports.map(report => {
            const sc = statusCfg[report.status];
            const tc = typeColor[report.type];
            const tb = typeBg[report.type];
            const historyOpen = expandedHistory === report.id;
            const sends = sendsMap[report.id] || [];
            return (
              <div key={report.id} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '12px', overflow: 'hidden',
                borderLeft: `3px solid ${tc}`,
                transition: 'box-shadow .18s, border-color .18s',
              }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,.35)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
              >
                {/* Main row */}
                <div style={{ padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>

                    {/* Type icon */}
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: tb, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                      <FileText size={18} color={tc} />
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: tc, background: tb, padding: '2px 8px', borderRadius: '10px', border: `1px solid ${tc}33` }}>
                          {typeLabel[report.type]}
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: sc.color, background: sc.bg, padding: '2px 8px', borderRadius: '10px', border: `1px solid ${sc.border}` }}>
                          {sc.label}{report.status === 'viewed' && ` (${report.viewed_count}×)`}
                        </span>
                        <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 500 }}>
                          {report.account_name}
                        </span>
                      </div>

                      <p style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px', color: 'var(--text-primary)' }}>
                        {report.client_name ? <span style={{ color: tc }}>{report.client_name} — </span> : ''}
                        {fmtDate(report.period_start)} a {fmtDate(report.period_end)}
                      </p>

                      {report.summary && (
                        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                          {report.summary}
                        </p>
                      )}

                      <div style={{ display: 'flex', gap: '14px', fontSize: '11.5px', color: 'var(--text-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Calendar size={11} /> {fmtDT(report.created_at)}
                        </span>
                        {report.sent_at && <span>Enviado {fmtDT(report.sent_at)}</span>}
                        {report.client_email && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--primary)', fontWeight: 500 }}>
                            <Mail size={10} /> {report.client_email}
                          </span>
                        )}
                        {report.client_phone && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#25d366', fontWeight: 500 }}>
                            <Phone size={10} /> {report.client_phone}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center', paddingLeft: '8px', borderLeft: '1px solid var(--border)' }}>
                      <Link href={`/reports/${report.id}/edit`} title="Editar"
                        style={iconBtnStyle()}>
                        <Edit2 size={15} />
                      </Link>
                      <a href={`/report/${report.public_token}`} target="_blank" rel="noopener noreferrer"
                        title="Visualizar" style={iconBtnStyle()}>
                        <Eye size={15} />
                      </a>
                      <a href={`/report/${report.public_token}?print=1`} target="_blank" rel="noopener noreferrer"
                        title="Baixar PDF" style={iconBtnStyle()}>
                        <Download size={15} />
                      </a>
                      <button onClick={() => copyLink(report.public_token)} title="Copiar link"
                        style={iconBtnStyle(copiedToken === report.public_token ? { color: '#34d399', borderColor: 'rgba(52,211,153,.3)', background: 'rgba(52,211,153,.08)' } : {})}>
                        {copiedToken === report.public_token ? <Check size={15} /> : <Copy size={15} />}
                      </button>
                      <button onClick={() => sendReport(report.id, report.client_email || undefined)}
                        disabled={sendingId === report.id} title="Enviar por email"
                        style={iconBtnStyle({ background: 'rgba(99,102,241,.1)', borderColor: 'rgba(99,102,241,.25)', color: '#a5b4fc' })}>
                        {sendingId === report.id
                          ? <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                          : <Send size={15} />}
                      </button>
                      <button onClick={() => openWaModal(report)}
                        disabled={waLoadingId === report.id} title="Enviar por WhatsApp"
                        style={iconBtnStyle({ background: 'rgba(37,211,102,.1)', borderColor: 'rgba(37,211,102,.25)', color: '#25d366' })}>
                        {waLoadingId === report.id
                          ? <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                          : <MessageCircle size={15} />}
                      </button>
                      <button onClick={() => toggleHistory(report.id)} title="Histórico de envios"
                        style={iconBtnStyle(historyOpen ? { background: 'rgba(251,191,36,.1)', borderColor: 'rgba(251,191,36,.3)', color: '#fbbf24' } : {})}>
                        {historyOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                      <button onClick={() => deleteReport(report.id)} title="Remover"
                        style={iconBtnStyle({ background: 'rgba(239,68,68,.08)', borderColor: 'rgba(239,68,68,.2)', color: '#f87171' })}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Send history panel */}
                {historyOpen && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '14px 20px', background: 'rgba(0,0,0,.15)' }}>
                    <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '10px' }}>
                      Histórico de Envios
                    </p>

                    {loadingSends === report.id ? (
                      <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                        {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: '34px', borderRadius: '6px' }} />)}
                      </div>
                    ) : sends.length === 0 ? (
                      <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', padding: '8px 0' }}>
                        Nenhum envio registrado ainda.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {sends.map(send => (
                          <div key={send.id} style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '8px 12px', borderRadius: '7px',
                            background: 'var(--bg-input)', border: '1px solid var(--border)',
                          }}>
                            {send.channel === 'whatsapp' ? (
                              <MessageCircle size={13} color="#25d366" />
                            ) : (
                              <Mail size={13} color="#a5b4fc" />
                            )}
                            <span style={{
                              fontSize: '11px', fontWeight: 700, padding: '1px 7px', borderRadius: '8px',
                              background: send.channel === 'whatsapp' ? 'rgba(37,211,102,.12)' : 'rgba(99,102,241,.12)',
                              color: send.channel === 'whatsapp' ? '#25d366' : '#a5b4fc',
                              border: `1px solid ${send.channel === 'whatsapp' ? 'rgba(37,211,102,.25)' : 'rgba(99,102,241,.25)'}`,
                              textTransform: 'uppercase', letterSpacing: '0.4px',
                            }}>
                              {send.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
                            </span>
                            <span style={{ fontSize: '12.5px', color: 'var(--text-primary)', flex: 1, fontWeight: 500 }}>
                              {send.channel === 'whatsapp' && send.recipient.startsWith('https://chat.whatsapp.com/')
                                ? <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,.1)', padding: '1px 6px', borderRadius: '6px', border: '1px solid rgba(251,191,36,.2)' }}>GRUPO</span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                      {send.recipient.replace('https://chat.whatsapp.com/', '').substring(0, 20)}…
                                    </span>
                                  </span>
                                : send.recipient}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                              <Clock size={11} /> {fmtDT(send.sent_at)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal: Gerar Relatório ── */}
      {showGenModal && (
        <Modal title="Gerar Relatório" onClose={() => setShowGenModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Tabs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 4, background: 'var(--bg-input)', borderRadius: 8 }}>
              {[
                { key: 'connected', label: 'Conta conectada', sub: 'Dados sincronizados automaticamente' },
                { key: 'manual', label: 'Dados manuais', sub: 'CSV ou texto livre (sem sync Meta)' },
              ].map((t: any) => (
                <button
                  key={t.key}
                  onClick={() => { setGenMode(t.key); setManualError(''); }}
                  style={{
                    padding: '10px 12px', borderRadius: 6, cursor: 'pointer', border: 'none',
                    background: genMode === t.key ? 'var(--bg-surface-2)' : 'transparent',
                    color: genMode === t.key ? 'var(--text)' : 'var(--text-muted)',
                    boxShadow: genMode === t.key ? 'var(--shadow-xs)' : 'none',
                    textAlign: 'left', fontFamily: 'inherit',
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</div>
                  <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2, opacity: 0.75 }}>{t.sub}</div>
                </button>
              ))}
            </div>

            {/* Tipo + período (comum aos dois modos) */}
            <div>
              <label style={labelStyle}>Tipo de relatório *</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                {(['daily', 'weekly', 'monthly'] as const).map(t => (
                  <button key={t} onClick={() => setGenForm(f => ({ ...f, type: t }))}
                    style={{
                      padding: '12px 8px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                      border: `1.5px solid ${genForm.type === t ? typeColor[t] : 'var(--border)'}`,
                      background: genForm.type === t ? typeBg[t] : 'transparent',
                      color: genForm.type === t ? typeColor[t] : 'var(--text-muted)',
                      fontSize: '13px', fontWeight: 700, transition: 'all .15s',
                    }}>
                    {typeLabel[t]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
                <div
                  onClick={() => setGenForm(f => ({ ...f, custom_period: !f.custom_period }))}
                  style={{
                    width: '36px', height: '20px', borderRadius: '10px', position: 'relative', flexShrink: 0,
                    background: genForm.custom_period ? 'rgba(99,102,241,.7)' : 'var(--bg-input)',
                    border: `1px solid ${genForm.custom_period ? 'rgba(99,102,241,.8)' : 'var(--border)'}`,
                    transition: 'all .2s', cursor: 'pointer',
                  }}>
                  <div style={{
                    position: 'absolute', top: '2px', left: genForm.custom_period ? '17px' : '2px',
                    width: '14px', height: '14px', borderRadius: '50%',
                    background: genForm.custom_period ? '#fff' : 'var(--text-muted)',
                    transition: 'left .2s',
                  }} />
                </div>
                <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>Período personalizado</span>
              </label>
            </div>

            {genForm.custom_period && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Data início *</label>
                  <input type="date" value={genForm.period_start}
                    onChange={e => setGenForm(f => ({ ...f, period_start: e.target.value }))}
                    className="form-input" style={{ minHeight: 36, fontSize: 13 }} />
                </div>
                <div>
                  <label style={labelStyle}>Data fim *</label>
                  <input type="date" value={genForm.period_end}
                    onChange={e => setGenForm(f => ({ ...f, period_end: e.target.value }))}
                    min={genForm.period_start}
                    className="form-input" style={{ minHeight: 36, fontSize: 13 }} />
                </div>
              </div>
            )}

            {/* ── Modo: Conta conectada ── */}
            {genMode === 'connected' && (
              <>
                <div>
                  <label style={labelStyle}>Conta do cliente *</label>
                  <AccountSelect accounts={accounts} value={genForm.account_id}
                    onChange={id => setGenForm(f => ({ ...f, account_id: id }))} placeholder="Selecione uma conta" />
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', background: 'var(--bg-input)', padding: '12px 14px', borderRadius: '8px', lineHeight: 1.6, borderLeft: '3px solid rgba(99,102,241,.4)' }}>
                  Sincroniza dados frescos da Meta API antes de gerar a análise via IA.
                </div>
              </>
            )}

            {/* ── Modo: Manual ── */}
            {genMode === 'manual' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Nome do cliente *</label>
                    <input type="text" value={manualForm.client_name}
                      onChange={e => setManualForm(f => ({ ...f, client_name: e.target.value }))}
                      placeholder="Ex: Matheus Oliveira"
                      className="form-input" style={{ minHeight: 36, fontSize: 13 }} />
                  </div>
                  <div>
                    <label style={labelStyle}>Ação principal</label>
                    <select value={manualForm.primary_action}
                      onChange={e => setManualForm(f => ({ ...f, primary_action: e.target.value as any }))}
                      className="form-select" style={{ minHeight: 36, fontSize: 13 }}>
                      <option value="">Auto-detectar</option>
                      <option value="purchase">Compras</option>
                      <option value="lead">Leads</option>
                      <option value="message">Mensagens</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Email do cliente</label>
                    <input type="email" value={manualForm.client_email}
                      onChange={e => setManualForm(f => ({ ...f, client_email: e.target.value }))}
                      placeholder="cliente@exemplo.com"
                      className="form-input" style={{ minHeight: 36, fontSize: 13 }} />
                  </div>
                  <div>
                    <label style={labelStyle}>WhatsApp do cliente</label>
                    <input type="tel" value={manualForm.client_phone}
                      onChange={e => setManualForm(f => ({ ...f, client_phone: e.target.value }))}
                      placeholder="+55 11 99999-9999"
                      className="form-input" style={{ minHeight: 36, fontSize: 13 }} />
                  </div>
                </div>

                {/* Input type tabs */}
                <div>
                  <label style={labelStyle}>Origem dos dados *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 4, background: 'var(--bg-input)', borderRadius: 8 }}>
                    {[
                      { k: 'csv', label: 'CSV do Meta' },
                      { k: 'text', label: 'Texto livre' },
                    ].map((t: any) => (
                      <button key={t.k}
                        onClick={() => setManualForm(f => ({ ...f, input_type: t.k }))}
                        style={{
                          padding: '7px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
                          background: manualForm.input_type === t.k ? 'var(--bg-surface-2)' : 'transparent',
                          color: manualForm.input_type === t.k ? 'var(--text)' : 'var(--text-muted)',
                          fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit',
                        }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {manualForm.input_type === 'csv' && (
                  <>
                    {/* File upload / drop zone */}
                    {!csvFileName ? (
                      <div
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={e => {
                          e.preventDefault();
                          setDragOver(false);
                          const file = e.dataTransfer.files?.[0];
                          if (file) readCsvFile(file);
                        }}
                        onClick={() => document.getElementById('tai-csv-file')?.click()}
                        style={{
                          border: `1.5px dashed ${dragOver ? 'var(--primary)' : 'var(--border-strong)'}`,
                          borderRadius: 10,
                          padding: '28px 18px',
                          textAlign: 'center',
                          cursor: 'pointer',
                          background: dragOver ? 'var(--primary-soft)' : 'var(--bg-surface-2)',
                          transition: 'var(--transition)',
                        }}
                      >
                        <Upload size={28} style={{ color: dragOver ? 'var(--primary)' : 'var(--text-muted)', marginBottom: 8 }} />
                        <div style={{ fontSize: 13.5, color: 'var(--text-primary)', fontWeight: 500, marginBottom: 4 }}>
                          {dragOver ? 'Solte o arquivo aqui' : 'Clique ou arraste seu CSV aqui'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          Aceita .csv, .tsv, .txt (até 10 MB)
                        </div>
                        <input
                          id="tai-csv-file"
                          type="file"
                          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                          style={{ display: 'none' }}
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) readCsvFile(file);
                            e.target.value = '';
                          }}
                        />
                      </div>
                    ) : (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '14px 16px',
                        background: 'var(--primary-soft)',
                        border: '1px solid rgba(99, 102, 241, 0.22)',
                        borderRadius: 10,
                      }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 8,
                          background: 'rgba(99, 102, 241, 0.18)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <FileSpreadsheet size={18} color="var(--primary)" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-primary)' }} className="truncate">
                            {csvFileName}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                            {csvRowCount.toLocaleString('pt-BR')} linha{csvRowCount === 1 ? '' : 's'} de dados · pronto para análise
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={clearCsvUpload}
                          className="btn btn-ghost btn-sm btn-icon"
                          title="Remover"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}

                    {/* Expansão opcional — colar manualmente */}
                    <details style={{ marginTop: -4 }}>
                      <summary style={{
                        fontSize: 11.5, color: 'var(--text-muted)', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 4, userSelect: 'none',
                      }}>
                        Ou cole o conteúdo manualmente
                      </summary>
                      <textarea value={manualForm.csv_data}
                        onChange={e => { setManualForm(f => ({ ...f, csv_data: e.target.value })); if (csvFileName) setCsvFileName(''); }}
                        placeholder={`"Nome da campanha","Valor gasto","Impressões","Cliques","Compras"\n"Campanha 1","1500,00","45000","890","12"`}
                        rows={6}
                        className="form-textarea mono"
                        style={{ fontSize: 11.5, minHeight: 120, fontFamily: 'var(--font-mono)', marginTop: 8 }} />
                    </details>

                    <div style={{
                      fontSize: 11.5, color: 'var(--text-muted)',
                      display: 'flex', alignItems: 'flex-start', gap: 6,
                      padding: '8px 10px',
                      background: 'var(--bg-surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                    }}>
                      <AlertCircle size={13} style={{ marginTop: 1, flexShrink: 0, color: 'var(--text-muted)' }} />
                      <span>
                        No Gerenciador de Anúncios da Meta: <strong>Relatórios › Exportar › CSV</strong>.
                        Se exportou como XLSX, abra no Excel/Google Sheets e salve como CSV primeiro.
                      </span>
                    </div>
                  </>
                )}

                {manualForm.input_type === 'text' && (
                  <>
                    <textarea value={manualForm.text_data}
                      onChange={e => setManualForm(f => ({ ...f, text_data: e.target.value }))}
                      placeholder={`Descreva as métricas do período em texto livre.\n\nExemplo:\nConta do Matheus Oliveira em abril de 2026. Investimento total R$ 14.000. Tivemos 8.306 cliques em 123.200 impressões (CTR 6.7%). Geramos 45 leads a CPL R$ 311. A campanha "Black Friday" foi a top com R$ 6.000 gastos e 20 leads. Frequência média 2.1x.`}
                      rows={10}
                      className="form-textarea"
                      style={{ fontSize: 13, minHeight: 180 }} />
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                      A IA vai extrair as métricas do texto. Quanto mais específico (valores, datas, campanhas), melhor o relatório.
                    </div>
                  </>
                )}

                {manualError && (
                  <div style={{
                    padding: '10px 12px', background: 'rgba(239,68,68,.08)',
                    border: '1px solid rgba(239,68,68,.22)', borderRadius: 8,
                    color: '#fca5a5', fontSize: 12.5,
                  }}>
                    {manualError}
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowGenModal(false)}>Cancelar</button>
              <button className="btn btn-primary btn-sm"
                onClick={genMode === 'connected' ? generateReport : generateManualReport}
                disabled={generating
                  || (genMode === 'connected' && !genForm.account_id)
                  || (genForm.custom_period && (!genForm.period_start || !genForm.period_end))}>
                {generating
                  ? <><div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} /> Gerando…</>
                  : <><Plus size={14} /> Gerar</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: Enviar por WhatsApp ── */}
      {showWaModal && (() => {
        const isGroup = isGroupLink(waPhone);
        return (
          <Modal title="Enviar por WhatsApp" onClose={() => setShowWaModal(null)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

              {/* Tipo detectado */}
              {waPhone.trim() ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px',
                  borderRadius: '10px', border: `1px solid ${isGroup ? 'rgba(251,191,36,.25)' : 'rgba(37,211,102,.2)'}`,
                  background: isGroup ? 'rgba(251,191,36,.08)' : 'rgba(37,211,102,.08)',
                }}>
                  <MessageCircle size={16} color={isGroup ? '#fbbf24' : '#25d366'} />
                  <p style={{ fontSize: '12.5px', margin: 0, color: 'var(--text-primary)', fontWeight: 500 }}>
                    {isGroup
                      ? <><span style={{ color: '#fbbf24', fontWeight: 700 }}>Grupo detectado</span> — o link do relatório será copiado automaticamente ao abrir o grupo.</>
                      : <><span style={{ color: '#25d366', fontWeight: 700 }}>Contato individual</span> — o WhatsApp abrirá com a mensagem já preenchida.</>}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 14px', background: 'rgba(37,211,102,.06)', borderRadius: '10px', border: '1px solid rgba(37,211,102,.15)' }}>
                  <MessageCircle size={16} color="#25d366" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <div>
                    <p style={{ fontSize: '12.5px', fontWeight: 600, margin: '0 0 4px', color: 'var(--text-primary)' }}>Número ou Grupo</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                      Informe o número do cliente <span style={{ color: 'var(--text-primary)' }}>ou cole o link do grupo</span> WhatsApp onde deseja enviar.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label style={labelStyle}>
                  {isGroup ? 'Link do Grupo WhatsApp *' : 'Número do WhatsApp *'}
                </label>
                {isGroup ? (
                  <input
                    value={waPhone}
                    onChange={e => setWaPhone(e.target.value)}
                    placeholder="https://chat.whatsapp.com/..."
                    style={inputStyle}
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && sendWhatsApp()}
                  />
                ) : (
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600 }}>+55</span>
                    <input
                      value={waPhone}
                      onChange={e => setWaPhone(e.target.value)}
                      placeholder="(11) 99999-9999  ou  https://chat.whatsapp.com/..."
                      style={{ ...inputStyle, paddingLeft: '48px' }}
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && sendWhatsApp()}
                    />
                  </div>
                )}
                <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  {isGroup
                    ? 'O link do relatório será copiado para você colar no grupo.'
                    : 'DDD + número (ex: 11999998888) ou link de grupo WhatsApp.'}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowWaModal(null)}>Cancelar</button>
                <button
                  onClick={sendWhatsApp}
                  disabled={!waPhone.trim() || waLoadingId === showWaModal.reportId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    background: isGroup
                      ? 'linear-gradient(135deg,#d97706,#b45309)'
                      : 'linear-gradient(135deg,#25d366,#128c7e)',
                    color: '#fff', fontSize: '13px', fontWeight: 700, transition: 'opacity .15s',
                    opacity: !waPhone.trim() ? 0.5 : 1,
                  }}>
                  {waLoadingId === showWaModal.reportId
                    ? <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px', borderTopColor: '#fff' }} />
                    : <MessageCircle size={14} />}
                  {isGroup ? 'Abrir Grupo' : 'Abrir WhatsApp'}
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* ── Modal: Configurações ── */}
      {showSettingsModal && (
        <Modal title="Configurações de Relatórios" onClose={() => setShowSettingsModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Conta</label>
              <AccountSelect accounts={accounts}
                value={genForm.account_id || selectedAccountId || ''}
                onChange={id => { setGenForm(f => ({ ...f, account_id: id })); loadSettings(id); }}
                placeholder="Selecione uma conta" />
            </div>

            <div>
              <label style={labelStyle}>Nome do cliente</label>
              <input value={settingsForm.client_name}
                onChange={e => setSettingsForm(f => ({ ...f, client_name: e.target.value }))}
                placeholder="Ex: João Silva" style={inputStyle} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>
                  <Mail size={10} style={{ display: 'inline', marginRight: '4px' }} />
                  Email
                </label>
                <input type="email" value={settingsForm.client_email}
                  onChange={e => setSettingsForm(f => ({ ...f, client_email: e.target.value }))}
                  placeholder="cliente@email.com" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>
                  <MessageCircle size={10} style={{ display: 'inline', marginRight: '4px', color: '#25d366' }} />
                  WhatsApp (número ou grupo)
                </label>
                <input type="text" value={settingsForm.client_phone}
                  onChange={e => setSettingsForm(f => ({ ...f, client_phone: e.target.value }))}
                  placeholder="11999998888 ou https://chat.whatsapp.com/..." style={inputStyle} />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Relatórios automáticos</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                {([
                  { key: 'daily_enabled',   label: 'Diário' },
                  { key: 'weekly_enabled',  label: 'Semanal' },
                  { key: 'monthly_enabled', label: 'Mensal' },
                ] as const).map(({ key, label }) => {
                  const active = (settingsForm as any)[key];
                  return (
                    <button key={key}
                      onClick={() => setSettingsForm(f => ({ ...f, [key]: !f[key as keyof ReportSettings] }))}
                      style={{
                        padding: '10px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                        border: `1.5px solid ${active ? 'rgba(99,102,241,.5)' : 'var(--border)'}`,
                        background: active ? 'rgba(99,102,241,.12)' : 'transparent',
                        color: active ? '#a5b4fc' : 'var(--text-muted)',
                        fontSize: '13px', fontWeight: 600, transition: 'all .15s',
                      }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Send size={14} color="#a5b4fc" />
                  <div>
                    <p style={{ fontSize: '13.5px', fontWeight: 600, margin: 0 }}>Auto-envio por email</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>Envia automaticamente ao gerar relatório</p>
                  </div>
                </div>
                <Toggle value={settingsForm.auto_send_email}
                  onChange={v => setSettingsForm(f => ({ ...f, auto_send_email: v }))} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid rgba(37,211,102,.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <MessageCircle size={14} color="#25d366" />
                  <div>
                    <p style={{ fontSize: '13.5px', fontWeight: 600, margin: 0 }}>Lembrete WhatsApp</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>Notifica você para enviar ao cliente</p>
                  </div>
                </div>
                <Toggle value={settingsForm.auto_send_whatsapp}
                  onChange={v => setSettingsForm(f => ({ ...f, auto_send_whatsapp: v }))} />
              </div>

              <div style={{ padding: '12px 14px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid rgba(37,211,102,.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <MessageCircle size={14} color="#25d366" />
                    <div>
                      <p style={{ fontSize: '13.5px', fontWeight: 600, margin: 0 }}>Relatório diário em texto</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>Envia métricas do dia anterior por WhatsApp às 08h15</p>
                    </div>
                  </div>
                  <Toggle value={settingsForm.daily_whatsapp_enabled}
                    onChange={v => setSettingsForm(f => ({ ...f, daily_whatsapp_enabled: v }))} />
                </div>
                {settingsForm.daily_whatsapp_enabled && (
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
                    <button
                      onClick={sendDailyWhatsAppNow}
                      disabled={sendingDailyWa}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: 'rgba(37,211,102,.15)', border: '1px solid rgba(37,211,102,.35)', borderRadius: '6px', color: '#25d366', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      <MessageCircle size={12} />
                      {sendingDailyWa ? 'Enviando…' : 'Enviar agora (teste)'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label style={labelStyle}>Nome da agência</label>
              <input value={settingsForm.agency_name}
                onChange={e => setSettingsForm(f => ({ ...f, agency_name: e.target.value }))}
                placeholder="Minha Agência" style={inputStyle} />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowSettingsModal(false)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={saveSettings} disabled={savingSettings}>
                {savingSettings ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Subcomponents ── */

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      style={{
        width: '42px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
        background: value ? 'var(--primary)' : 'var(--bg-input)',
        outline: '1px solid ' + (value ? 'rgba(99,102,241,.4)' : 'var(--border)'),
        position: 'relative',
        transition: 'background .2s, box-shadow .2s', flexShrink: 0,
        boxShadow: value ? '0 0 10px rgba(99,102,241,.35)' : 'none',
      }}>
      <span style={{
        position: 'absolute', top: '4px', left: value ? '22px' : '4px',
        width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
        transition: 'left .2s', display: 'block',
        boxShadow: '0 1px 4px rgba(0,0,0,.35)',
      }} />
    </button>
  );
}

/* ── Style helpers ── */

function iconBtnStyle(overrides: React.CSSProperties = {}): React.CSSProperties {
  return {
    width: '32px', height: '32px', borderRadius: '7px', cursor: 'pointer',
    background: 'var(--bg-input)', border: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-muted)', transition: 'all .15s',
    flexShrink: 0,
    ...overrides,
  };
}

const labelStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '7px', display: 'block',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', background: 'var(--bg-input)',
  border: '1px solid var(--border)', borderRadius: '7px',
  color: 'var(--text-primary)', fontSize: '13.5px', outline: 'none',
  fontFamily: 'inherit', transition: 'border-color .15s',
};
