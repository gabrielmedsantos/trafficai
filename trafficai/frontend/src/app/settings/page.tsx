'use client';

import { useState, useEffect } from 'react';
import {
  Link2, CheckCircle, XCircle, RefreshCw, AlertCircle, Key,
  Bell, Mail, MessageCircle, Save, Send, Moon, ShieldCheck, Info,
  Zap, AlertTriangle, Smartphone,
} from 'lucide-react';
import { MetaConnectButton } from '@/components/MetaConnectButton';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const token = () => typeof window !== 'undefined' ? localStorage.getItem('trafficai_token') || '' : '';

interface User {
  id: string;
  email: string;
  name?: string;
  meta_connected: boolean;
}

interface NotificationSettings {
  email_enabled: boolean;
  notification_email: string;
  resend_api_key: string;
  whatsapp_enabled: boolean;
  whatsapp_number: string;
  whatsapp_provider: 'uazapi' | 'evolution' | 'zapi';
  uazapi_url: string;
  uazapi_token: string;
  evolution_api_url: string;
  evolution_api_key: string;
  evolution_instance: string;
  zapi_instance_id: string;
  zapi_token: string;
  zapi_client_token: string;
  notify_critical: boolean;
  notify_warning: boolean;
  notify_info: boolean;
  quiet_hours_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  owner_whatsapp: string;
  daily_report_approval_required: boolean;
  push_enabled: boolean;
}

const defaultSettings: NotificationSettings = {
  email_enabled: true,
  notification_email: '',
  resend_api_key: '',
  whatsapp_enabled: false,
  whatsapp_number: '',
  whatsapp_provider: 'uazapi',
  uazapi_url: '',
  uazapi_token: '',
  evolution_api_url: '',
  evolution_api_key: '',
  evolution_instance: '',
  zapi_instance_id: '',
  zapi_token: '',
  zapi_client_token: '',
  notify_critical: true,
  notify_warning: true,
  notify_info: false,
  quiet_hours_enabled: false,
  quiet_start: '22:00',
  quiet_end: '08:00',
  owner_whatsapp: '',
  daily_report_approval_required: false,
  push_enabled: false,
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function isIosDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && (navigator as any).maxTouchPoints > 1);
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
}

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [showManualToken, setShowManualToken] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [savingToken, setSavingToken] = useState(false);

  const [notif, setNotif] = useState<NotificationSettings>(defaultSettings);
  const [savingNotif, setSavingNotif] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingWpp, setTestingWpp] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState('');
  const [testMsg, setTestMsg] = useState<{ channel: string; success: boolean; msg: string } | null>(null);

  useEffect(() => {
    loadUser();
    loadNotifSettings();
  }, []);

  const loadUser = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token()}` } });
      const result = await res.json();
      if (result.success) setUser(result.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadNotifSettings = async () => {
    try {
      const res = await fetch(`${API}/settings/notifications`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const result = await res.json();
      if (result.success && result.data) {
        setNotif({ ...defaultSettings, ...result.data });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const connectMeta = async () => {
    try {
      setConnecting(true);
      const res = await fetch(`${API}/auth/meta/connect`, { headers: { Authorization: `Bearer ${token()}` } });
      const result = await res.json();
      if (result.success && result.data.url) window.location.href = result.data.url;
    } catch (e: any) {
      alert('Erro ao conectar com o Meta: ' + e.message);
      setConnecting(false);
    }
  };

  const saveManualToken = async () => {
    if (!manualToken.trim()) return alert('Por favor, insira o token de acesso');
    try {
      setSavingToken(true);
      const res = await fetch(`${API}/auth/meta/manual-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ access_token: manualToken }),
      });
      const result = await res.json();
      if (result.success) {
        alert('Token salvo com sucesso!');
        setManualToken(''); setShowManualToken(false); await loadUser();
      } else {
        alert('Erro: ' + (result.error?.message || 'Token inválido'));
      }
    } catch (e: any) {
      alert('Erro ao salvar token: ' + e.message);
    } finally {
      setSavingToken(false);
    }
  };

  const saveNotifSettings = async () => {
    try {
      setSavingNotif(true);
      const res = await fetch(`${API}/settings/notifications`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(notif),
      });
      const result = await res.json();
      if (result.success) {
        setNotifSaved(true);
        setTimeout(() => setNotifSaved(false), 3000);
      } else {
        alert('Erro ao salvar: ' + result.error?.message);
      }
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setSavingNotif(false);
    }
  };

  const sendTest = async (channel: 'email' | 'whatsapp' | 'push') => {
    if (channel === 'email') setTestingEmail(true);
    else if (channel === 'whatsapp') setTestingWpp(true);
    else setTestingPush(true);
    setTestMsg(null);
    try {
      const res = await fetch(`${API}/settings/notifications/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ channel }),
      });
      const result = await res.json();
      setTestMsg({ channel, success: result.success, msg: result.data?.message || result.error?.message || '' });
    } catch (e: any) {
      setTestMsg({ channel, success: false, msg: e.message });
    } finally {
      if (channel === 'email') setTestingEmail(false);
      else if (channel === 'whatsapp') setTestingWpp(false);
      else setTestingPush(false);
    }
  };

  // Ativa/desativa push notifications neste dispositivo. Diferente dos outros
  // canais, isso precisa de uma dança com APIs do browser (permissão + inscrição
  // no PushManager) antes de poder salvar push_enabled=true.
  // Persiste push_enabled imediatamente (sem esperar o botão "Salvar Configurações")
  // pra nao deixar a inscricao do dispositivo dessincronizada da flag no banco.
  const persistPushEnabled = async (value: boolean) => {
    const updated = { ...notif, push_enabled: value };
    setNotif(updated);
    try {
      await fetch(`${API}/settings/notifications`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(updated),
      });
    } catch { /* ignore — usuario ainda pode salvar manualmente depois */ }
  };

  const handlePushToggle = async (enable: boolean) => {
    setPushError('');
    if (!enable) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await fetch(`${API}/settings/notifications/push/unsubscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
        }
      } catch { /* ignore */ }
      await persistPushEnabled(false);
      return;
    }

    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushError('Este navegador não suporta notificações push.');
      return;
    }
    if (isIosDevice() && !isStandaloneDisplay()) {
      setPushError('No iPhone/iPad, abra o TrafficAI pelo ícone na Tela de Início (não pelo Safari) pra poder ativar notificações.');
      return;
    }

    setPushBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushError(permission === 'denied' ? 'Permissão de notificação negada no navegador.' : 'Permissão de notificação não concedida.');
        return;
      }

      const keyRes = await fetch(`${API}/settings/notifications/push/vapid-public-key`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const keyResult = await keyRes.json();
      if (!keyResult.success) {
        setPushError(keyResult.error?.message || 'Push não configurado no servidor');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyResult.data.publicKey) as BufferSource,
      });
      const subJson = sub.toJSON();

      const subRes = await fetch(`${API}/settings/notifications/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
      });
      const subResult = await subRes.json();
      if (!subResult.success) {
        setPushError(subResult.error?.message || 'Erro ao salvar inscrição');
        return;
      }

      await persistPushEnabled(true);
    } catch (e: any) {
      setPushError(e.message || 'Erro ao ativar notificações push');
    } finally {
      setPushBusy(false);
    }
  };

  const setN = (key: keyof NotificationSettings, value: any) =>
    setNotif(prev => ({ ...prev, [key]: value }));

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div className="spinner" style={{ width: '36px', height: '36px', borderWidth: '3px' }} />
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ maxWidth: '720px' }}>

      {/* ── Header ── */}
      <div className="page-header" style={{ marginBottom: '32px' }}>
        <div>
          <h1>Configurações</h1>
          <p>Gerencie integrações, notificações e configurações da conta</p>
        </div>
      </div>

      {/* ── Conta ── */}
      <Section icon={<Key size={16} color="var(--text-muted)" />} title="Informações da Conta">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Field label="Email">
            <p style={{ fontSize: '14px', color: 'var(--text-primary)', paddingTop: '2px' }}>{user?.email}</p>
          </Field>
          {user?.name && (
            <Field label="Nome">
              <p style={{ fontSize: '14px', color: 'var(--text-primary)', paddingTop: '2px' }}>{user.name}</p>
            </Field>
          )}
        </div>
      </Section>

      {/* ── Meta ── */}
      <Section icon={<Link2 size={16} color="var(--primary)" />} title="Integração Meta (Facebook Ads)">
        <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', marginBottom: '20px', lineHeight: 1.6 }}>
          Conecte sua conta do Meta para sincronizar campanhas e métricas automaticamente.
        </p>

        {/* Embedded Signup (Fluxo recomendado) */}
        <div style={{ marginBottom: 20 }}>
          <MetaConnectButton onConnected={() => window.location.reload()} />
        </div>

        {/* Manual token (fallback, avançado) */}
        {!user?.meta_connected && (
          <details style={{ marginTop: 12 }}>
            <summary style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
              Prefere colar token manualmente?
            </summary>
            <div style={{ marginTop: 10 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowManualToken(!showManualToken)}
                style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <Key size={14} /> Token Manual
              </button>
            </div>
          </details>
        )}

        {showManualToken && (
          <div style={{ marginTop: '16px', padding: '18px', background: 'var(--bg-input)', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: '13.5px', fontWeight: 600, marginBottom: '6px' }}>Inserir Token Manualmente</p>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Cole o Access Token do{' '}
              <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer">
                Meta Graph API Explorer
              </a>.
            </p>
            <textarea value={manualToken} onChange={e => setManualToken(e.target.value)}
              placeholder="EAAxxxxxx..." rows={3}
              style={{ ...inputSt, fontFamily: 'monospace', fontSize: '13px', resize: 'vertical', marginBottom: '10px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-primary btn-sm" onClick={saveManualToken} disabled={savingToken || !manualToken.trim()}>
                {savingToken ? 'Salvando...' : 'Salvar Token'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setShowManualToken(false); setManualToken(''); }}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* ── Notificações ── */}
      <Section icon={<Bell size={16} color="var(--primary)" />} title="Notificações de Alertas">
        <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', marginBottom: '24px', lineHeight: 1.6 }}>
          Receba alertas críticos de campanhas diretamente no seu WhatsApp e email em tempo real.
        </p>

        {/* Severidades */}
        <div style={{ marginBottom: '20px' }}>
          <label style={lblSt}>
            <ShieldCheck size={12} style={{ display: 'inline', marginRight: '5px' }} />
            Quais alertas receber
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              { key: 'notify_critical', label: 'Crítico',  color: '#ef4444', Icon: XCircle },
              { key: 'notify_warning',  label: 'Atenção',  color: '#f59e0b', Icon: AlertTriangle },
              { key: 'notify_info',     label: 'Info',     color: '#3b82f6', Icon: Info },
            ].map(({ key, label, color, Icon }) => {
              const active = (notif as any)[key];
              return (
                <button key={key} onClick={() => setN(key as any, !active)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '7px 14px', borderRadius: '20px',
                    border: `1.5px solid ${active ? color : 'var(--border)'}`,
                    background: active ? `${color}20` : 'transparent',
                    color: active ? color : 'var(--text-muted)',
                    fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all .18s',
                  }}>
                  <Icon size={13} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Horário silencioso */}
        <div style={{ padding: '14px 16px', background: 'var(--bg-input)', borderRadius: '10px', marginBottom: '16px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Moon size={15} color="var(--text-muted)" />
              <span style={{ fontSize: '13.5px', fontWeight: 600 }}>Horário Silencioso</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>— sem notificações neste intervalo</span>
            </div>
            <Toggle value={notif.quiet_hours_enabled} onChange={v => setN('quiet_hours_enabled', v)} />
          </div>
          {notif.quiet_hours_enabled && (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginTop: '14px' }}>
              <div>
                <label style={lblSt}>Silenciar a partir de</label>
                <input type="time" value={notif.quiet_start} onChange={e => setN('quiet_start', e.target.value)} style={inputSt} />
              </div>
              <span style={{ color: 'var(--text-muted)', paddingBottom: '10px', fontSize: '13px' }}>até</span>
              <div>
                <label style={lblSt}>Retomar às</label>
                <input type="time" value={notif.quiet_end} onChange={e => setN('quiet_end', e.target.value)} style={inputSt} />
              </div>
            </div>
          )}
        </div>

        {/* Email */}
        <ChannelBlock
          icon={<Mail size={16} color="#ff6b35" />}
          title="Email"
          enabled={notif.email_enabled}
          onToggle={v => setN('email_enabled', v)}
          accent="#ff6b35"
        >
          <Field label="Email para receber notificações *">
            <input type="email" value={notif.notification_email}
              onChange={e => setN('notification_email', e.target.value)}
              placeholder="seu@email.com" style={inputSt} />
          </Field>
          <Field label={<>Chave API Resend <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional — <a href="https://resend.com" target="_blank" rel="noopener noreferrer">criar conta grátis</a>)</span></>}>
            <input type="password" value={notif.resend_api_key}
              onChange={e => setN('resend_api_key', e.target.value)}
              placeholder="re_xxxxxxxxxxxx" style={inputSt} />
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Info size={11} /> Sem chave própria, emails são enviados com o domínio do sistema.
            </p>
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => sendTest('email')}
              disabled={testingEmail || !notif.notification_email}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Send size={13} /> {testingEmail ? 'Enviando...' : 'Testar Email'}
            </button>
            {testMsg?.channel === 'email' && (
              <span style={{ fontSize: '13px', color: testMsg.success ? 'var(--accent-green)' : 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                {testMsg.success ? <CheckCircle size={13} /> : <XCircle size={13} />} {testMsg.msg}
              </span>
            )}
          </div>
        </ChannelBlock>

        {/* WhatsApp */}
        <ChannelBlock
          icon={<MessageCircle size={16} color="#22c55e" />}
          title="WhatsApp"
          enabled={notif.whatsapp_enabled}
          onToggle={v => setN('whatsapp_enabled', v)}
          accent="#22c55e"
        >
          <Field label="Número WhatsApp (com DDI e DDD) *">
            <input type="tel" value={notif.whatsapp_number}
              onChange={e => setN('whatsapp_number', e.target.value)}
              placeholder="5511999999999" style={inputSt} />
          </Field>

          <Field label="Provedor">
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { val: 'uazapi',    label: 'UazAPI',        badge: 'Recomendado', Icon: Zap },
                { val: 'evolution', label: 'Evolution API', Icon: MessageCircle },
                { val: 'zapi',      label: 'Z-API',         Icon: MessageCircle },
              ].map(({ val, label, badge, Icon }) => {
                const active = notif.whatsapp_provider === val;
                return (
                  <button key={val} onClick={() => setN('whatsapp_provider', val as any)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '7px 14px', borderRadius: '8px',
                      border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                      background: active ? 'rgba(255, 107, 53,.14)' : 'transparent',
                      color: active ? '#ffa46e' : 'var(--text-muted)',
                      fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all .18s',
                    }}>
                    <Icon size={13} />
                    {label}
                    {badge && active && (
                      <span style={{ fontSize: '10px', background: 'var(--primary)', color: '#fff', padding: '1px 6px', borderRadius: '8px', marginLeft: '2px' }}>
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* UazAPI */}
          {notif.whatsapp_provider === 'uazapi' && (
            <ProviderBox>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Info size={12} /> UazAPI — WhatsApp API brasileira.{' '}
                <a href="https://uazapi.com" target="_blank" rel="noopener noreferrer">uazapi.com</a>
              </p>
              <Field label="URL base da instância *">
                <input value={notif.uazapi_url} onChange={e => setN('uazapi_url', e.target.value)}
                  placeholder="https://sua-instancia.uazapi.com" style={inputSt} />
              </Field>
              <Field label="Token da instância *">
                <input type="password" value={notif.uazapi_token} onChange={e => setN('uazapi_token', e.target.value)}
                  placeholder="Bearer token da instância" style={inputSt} />
              </Field>
            </ProviderBox>
          )}

          {/* Evolution */}
          {notif.whatsapp_provider === 'evolution' && (
            <ProviderBox>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Info size={12} /> Evolution API — open-source e self-hosted.{' '}
                <a href="https://doc.evolution-api.com" target="_blank" rel="noopener noreferrer">Documentação</a>
              </p>
              <Field label="URL da Evolution API *">
                <input value={notif.evolution_api_url} onChange={e => setN('evolution_api_url', e.target.value)}
                  placeholder="https://minha-evolution.meuservidor.com" style={inputSt} />
              </Field>
              <Field label="API Key">
                <input type="password" value={notif.evolution_api_key} onChange={e => setN('evolution_api_key', e.target.value)}
                  placeholder="Chave de API da Evolution" style={inputSt} />
              </Field>
              <Field label="Nome da Instância *">
                <input value={notif.evolution_instance} onChange={e => setN('evolution_instance', e.target.value)}
                  placeholder="minha-instancia" style={inputSt} />
              </Field>
            </ProviderBox>
          )}

          {/* Z-API */}
          {notif.whatsapp_provider === 'zapi' && (
            <ProviderBox>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Info size={12} /> Z-API — serviço SaaS brasileiro.{' '}
                <a href="https://z-api.io" target="_blank" rel="noopener noreferrer">z-api.io</a>
              </p>
              <Field label="Instance ID *">
                <input value={notif.zapi_instance_id} onChange={e => setN('zapi_instance_id', e.target.value)}
                  placeholder="ID da instância" style={inputSt} />
              </Field>
              <Field label="Token *">
                <input type="password" value={notif.zapi_token} onChange={e => setN('zapi_token', e.target.value)}
                  placeholder="Token da instância" style={inputSt} />
              </Field>
              <Field label="Client Token (Security Token)">
                <input type="password" value={notif.zapi_client_token} onChange={e => setN('zapi_client_token', e.target.value)}
                  placeholder="Client-Token do painel Z-API" style={inputSt} />
              </Field>
            </ProviderBox>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => sendTest('whatsapp')}
              disabled={testingWpp || !notif.whatsapp_number}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Send size={13} /> {testingWpp ? 'Enviando...' : 'Testar WhatsApp'}
            </button>
            {testMsg?.channel === 'whatsapp' && (
              <span style={{ fontSize: '13px', color: testMsg.success ? 'var(--accent-green)' : 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                {testMsg.success ? <CheckCircle size={13} /> : <XCircle size={13} />} {testMsg.msg}
              </span>
            )}
          </div>

          {/* ─── Aprovação de relatórios diários ──────────────────────────── */}
          <div style={{
            marginTop: '16px',
            padding: '14px',
            background: 'var(--bg-surface-2, rgba(255,255,255,0.02))',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              📋 Aprovação manual antes de enviar relatórios pros clientes
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              Quando ligado, o cron diário envia o relatório <strong>pro seu WhatsApp</strong> com um link.
              Você revisa e aprova; só então a mensagem é encaminhada pro cliente.
            </p>
            <Field label="Seu WhatsApp (formato 55DDDNUMERO)">
              <input type="tel" value={notif.owner_whatsapp}
                onChange={e => setN('owner_whatsapp', e.target.value)}
                placeholder="ex: 5511999999999" style={inputSt} />
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" checked={notif.daily_report_approval_required}
                onChange={e => setN('daily_report_approval_required', e.target.checked)} />
              Exigir minha aprovação antes de enviar pro cliente
            </label>
          </div>
        </ChannelBlock>

        {/* Push (notificação nativa no dispositivo — PWA instalado) */}
        <ChannelBlock
          icon={<Smartphone size={16} color="#8b5cf6" />}
          title="Notificação Push"
          enabled={notif.push_enabled}
          onToggle={handlePushToggle}
          accent="#8b5cf6"
        >
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.6 }}>
            Ativa neste dispositivo específico. No iPhone, precisa ter instalado o TrafficAI na Tela de Início
            e abrir por lá (não pelo Safari) antes de ativar.
          </p>
          {pushBusy && (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>Ativando…</p>
          )}
          {pushError && (
            <p style={{ fontSize: '13px', color: 'var(--accent-red)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <AlertCircle size={13} /> {pushError}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => sendTest('push')}
              disabled={testingPush || !notif.push_enabled}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Send size={13} /> {testingPush ? 'Enviando...' : 'Testar Push'}
            </button>
            {testMsg?.channel === 'push' && (
              <span style={{ fontSize: '13px', color: testMsg.success ? 'var(--accent-green)' : 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                {testMsg.success ? <CheckCircle size={13} /> : <XCircle size={13} />} {testMsg.msg}
              </span>
            )}
          </div>
        </ChannelBlock>

        {/* Salvar */}
        <button className="btn btn-primary" onClick={saveNotifSettings} disabled={savingNotif}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          {notifSaved
            ? <><CheckCircle size={16} /> Salvo!</>
            : <><Save size={16} /> {savingNotif ? 'Salvando...' : 'Salvar Configurações'}</>
          }
        </button>
      </Section>

    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(255, 107, 53,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        <h2 style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.2px' }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
      <label style={lblSt}>{label}</label>
      {children}
    </div>
  );
}

function ChannelBlock({ icon, title, enabled, onToggle, accent, children }: {
  icon: React.ReactNode; title: string; enabled: boolean;
  onToggle: (v: boolean) => void; accent: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      borderRadius: '10px', marginBottom: '16px',
      border: `1px solid ${enabled ? accent + '30' : 'var(--border)'}`,
      overflow: 'hidden', transition: 'border-color .2s',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px',
        background: enabled ? `${accent}08` : 'var(--bg-input)',
        transition: 'background .2s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {icon}
          <span style={{ fontSize: '14px', fontWeight: 700 }}>{title}</span>
        </div>
        <Toggle value={enabled} onChange={onToggle} />
      </div>
      {enabled && (
        <div style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: '0' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function ProviderBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0', padding: '14px', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '14px' }}>
      {children}
    </div>
  );
}

function StatusBox({ color, children }: { color: 'green' | 'red'; children: React.ReactNode }) {
  const c = color === 'green' ? '22,197,94' : '239,68,68';
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px 16px',
      background: `rgba(${c},.08)`, border: `1px solid rgba(${c},.22)`,
      borderRadius: '10px',
    }}>
      {children}
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
        width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
        background: value ? 'var(--primary)' : 'var(--bg-input)',
        outline: '1px solid ' + (value ? 'rgba(255, 107, 53,.4)' : 'var(--border)'),
        position: 'relative', transition: 'background .2s, box-shadow .2s', flexShrink: 0,
        boxShadow: value ? '0 0 10px rgba(255, 107, 53,.35)' : 'none',
      }}>
      <span style={{
        position: 'absolute', top: '3px', left: value ? '22px' : '3px',
        width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
        transition: 'left .2s', display: 'block',
        boxShadow: '0 1px 4px rgba(0,0,0,.35)',
      }} />
    </button>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const lblSt: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block',
};

const inputSt: React.CSSProperties = {
  width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)',
  border: '1px solid var(--border)', borderRadius: '7px',
  color: 'var(--text-primary)', fontSize: '13.5px', outline: 'none',
  transition: 'border-color .15s',
};
