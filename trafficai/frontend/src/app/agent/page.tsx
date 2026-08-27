'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, Loader2, Zap, ChevronDown, Trash2, Brain, Paperclip, X, FileSpreadsheet, Check, XCircle } from 'lucide-react';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Suggestion {
    id: string;
    campaign_id: string;
    campaign_name: string;
    action: 'pause' | 'activate' | 'set_budget';
    current_value: string | number;
    suggested_value: string | number;
    reason: string;
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    thinking?: string;
    toolCalls?: string[];
    suggestions?: Suggestion[];
    streaming?: boolean;
}

const ACTION_LABEL: Record<Suggestion['action'], string> = {
    pause: 'Pausar campanha',
    activate: 'Ativar campanha',
    set_budget: 'Ajustar orçamento diário',
};

function fmtSuggestionValue(action: Suggestion['action'], v: string | number): string {
    if (action === 'set_budget') return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    if (v === 'ACTIVE') return 'Ativa';
    if (v === 'PAUSED') return 'Pausada';
    return String(v);
}

// ─── Suggested prompts ────────────────────────────────────────────────────────
const SUGGESTIONS = [
    'Quais são minhas campanhas ativas agora?',
    'Analise a performance geral da minha conta esta semana',
    'Qual campanha está com o melhor ROAS?',
    'Minha frequência está alta? Há risco de fadiga?',
    'Como posso reduzir meu CPL?',
    'Explique como funciona o CBO vs ABO',
    'O que é uma boa taxa de conversão no Meta Ads?',
    'Como escalar uma campanha que está performando bem?',
];

function uid() { return Math.random().toString(36).slice(2); }

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSV(text: string): string {
    const lines = text.trim().split('\n').filter(Boolean);
    if (!lines.length) return '';
    // Limit to first 500 rows to avoid token overflow
    const limited = lines.slice(0, 501);
    const truncated = lines.length > 501;
    const result = limited.join('\n');
    return truncated ? result + `\n... (${lines.length - 501} linhas omitidas)` : result;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AgentPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [showThinking, setShowThinking] = useState<Record<string, boolean>>({});
    const [csvFile, setCsvFile] = useState<{ name: string; content: string } | null>(null);
    const [suggestionState, setSuggestionState] = useState<Record<string, 'pending' | 'applying' | 'applied' | 'dismissed' | 'error'>>({});
    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            setCsvFile({ name: file.name, content: parseCSV(text) });
        };
        reader.readAsText(file, 'UTF-8');
        e.target.value = '';
    };

    async function applySuggestion(s: Suggestion) {
        setSuggestionState(prev => ({ ...prev, [s.id]: 'applying' }));
        try {
            await api.applyAgentSuggestion(
                s.campaign_id,
                s.action,
                s.action === 'set_budget' ? Number(s.suggested_value) : undefined,
            );
            setSuggestionState(prev => ({ ...prev, [s.id]: 'applied' }));
        } catch (err: any) {
            setSuggestionState(prev => ({ ...prev, [s.id]: 'error' }));
            alert('Erro ao aplicar: ' + err.message);
        }
    }

    function dismissSuggestion(s: Suggestion) {
        setSuggestionState(prev => ({ ...prev, [s.id]: 'dismissed' }));
    }

    const send = useCallback(async (text: string) => {
        if (!text.trim() || loading) return;

        // If CSV attached, prepend it to the message
        const fullContent = csvFile
            ? `Analise o seguinte CSV de campanhas e responda: ${text}\n\n\`\`\`csv\n${csvFile.content}\n\`\`\``
            : text.trim();

        const displayContent = csvFile ? `📎 ${csvFile.name}\n\n${text.trim()}` : text.trim();
        const userMsg: Message = { id: uid(), role: 'user', content: displayContent };
        const assistantId = uid();
        const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', streaming: true };

        setMessages(prev => [...prev, userMsg, assistantMsg]);
        setInput('');
        setCsvFile(null);
        setLoading(true);

        // History uses fullContent (with CSV) for the last user message
        const apiUserMsg = { role: 'user' as const, content: fullContent };
        const history = [...messages.map(m => ({ role: m.role, content: m.content })), apiUserMsg];

        abortRef.current = new AbortController();

        try {
            const token = localStorage.getItem('trafficai_token');
            const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

            const res = await fetch(`${API_BASE}/ai/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ messages: history }),
                signal: abortRef.current.signal,
            });

            if (!res.ok || !res.body) {
                const err = await res.json().catch(() => ({ error: { message: 'Erro na conexão' } }));
                throw new Error(err.error?.message || `HTTP ${res.status}`);
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (!raw) continue;

                    try {
                        const event = JSON.parse(raw);

                        if (event.type === 'text') {
                            setMessages(prev => prev.map(m =>
                                m.id === assistantId
                                    ? { ...m, content: m.content + event.text }
                                    : m
                            ));
                        } else if (event.type === 'thinking') {
                            setMessages(prev => prev.map(m =>
                                m.id === assistantId
                                    ? { ...m, thinking: (m.thinking || '') + event.text }
                                    : m
                            ));
                        } else if (event.type === 'tool_calls') {
                            setMessages(prev => prev.map(m =>
                                m.id === assistantId
                                    ? { ...m, toolCalls: event.tools }
                                    : m
                            ));
                        } else if (event.type === 'suggestion') {
                            const s: Suggestion = event.suggestion;
                            setMessages(prev => prev.map(m =>
                                m.id === assistantId
                                    ? { ...m, suggestions: [...(m.suggestions || []), s] }
                                    : m
                            ));
                            setSuggestionState(prev => ({ ...prev, [s.id]: 'pending' }));
                        } else if (event.type === 'done') {
                            setMessages(prev => prev.map(m =>
                                m.id === assistantId ? { ...m, streaming: false } : m
                            ));
                        } else if (event.type === 'error') {
                            setMessages(prev => prev.map(m =>
                                m.id === assistantId
                                    ? { ...m, content: `Erro: ${event.text}`, streaming: false }
                                    : m
                            ));
                        }
                    } catch { /* ignore malformed events */ }
                }
            }
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                setMessages(prev => prev.map(m =>
                    m.id === assistantId
                        ? { ...m, content: `Erro: ${err.message}`, streaming: false }
                        : m
                ));
            }
        } finally {
            setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, streaming: false } : m
            ));
            setLoading(false);
            abortRef.current = null;
            setTimeout(() => textareaRef.current?.focus(), 50);
        }
    }, [messages, loading]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send(input);
        }
    };

    const toggleThinking = (id: string) =>
        setShowThinking(prev => ({ ...prev, [id]: !prev[id] }));

    const clearChat = () => {
        if (loading) { abortRef.current?.abort(); }
        setMessages([]);
        setLoading(false);
    };

    const toolLabel: Record<string, string> = {
        listar_campanhas: 'buscando campanhas',
        ver_insights_campanha: 'carregando insights',
        overview_conta: 'analisando conta',
        comparar_campanhas: 'comparando campanhas',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)' }}>

            {/* Header */}
            <div style={{
                padding: '16px 24px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
                background: 'var(--bg-card)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '40px', height: '40px', borderRadius: '12px',
                        background: 'var(--gradient-primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 20px rgba(59,130,246,0.3)',
                    }}>
                        <Bot size={20} color="white" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            Gestor de Tráfego IA
                        </h1>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            Especialista em Meta Ads · com IA
                        </p>
                    </div>
                </div>
                {messages.length > 0 && (
                    <button
                        onClick={clearChat}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)',
                            background: 'transparent', color: 'var(--text-muted)',
                            fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                    >
                        <Trash2 size={14} /> Nova conversa
                    </button>
                )}
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                {messages.length === 0 ? (
                    /* Welcome screen */
                    <div style={{ maxWidth: '680px', margin: '0 auto', paddingTop: '40px' }}>
                        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                            <div style={{
                                width: '72px', height: '72px', borderRadius: '20px',
                                background: 'var(--gradient-primary)',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                marginBottom: '16px',
                                boxShadow: '0 0 40px rgba(59,130,246,0.25)',
                            }}>
                                <Zap size={32} color="white" />
                            </div>
                            <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                Seu Gestor de Tráfego Inteligente
                            </h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '15px', lineHeight: 1.6 }}>
                                Sou especialista em Meta Ads com acesso aos seus dados de campanha.<br />
                                Pergunte sobre performance, estratégias e otimizações.
                            </p>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            {SUGGESTIONS.map(s => (
                                <button
                                    key={s}
                                    onClick={() => send(s)}
                                    style={{
                                        padding: '12px 16px', borderRadius: '10px',
                                        border: '1px solid var(--border)',
                                        background: 'var(--bg-card)',
                                        color: 'var(--text-secondary)',
                                        fontSize: '13px', textAlign: 'left',
                                        cursor: 'pointer', fontFamily: 'inherit',
                                        lineHeight: 1.4,
                                        transition: 'border-color 0.2s, background 0.2s',
                                    }}
                                    onMouseEnter={e => {
                                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)';
                                        (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.05)';
                                    }}
                                    onMouseLeave={e => {
                                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                                        (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)';
                                    }}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {messages.map(msg => (
                            <div key={msg.id} style={{
                                display: 'flex',
                                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                gap: '10px',
                            }}>
                                {msg.role === 'assistant' && (
                                    <div style={{
                                        width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0,
                                        background: 'var(--gradient-primary)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        marginTop: '2px',
                                    }}>
                                        <Bot size={16} color="white" />
                                    </div>
                                )}
                                <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {/* Tool calls indicator */}
                                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                                        <div style={{
                                            display: 'flex', gap: '6px', flexWrap: 'wrap',
                                        }}>
                                            {msg.toolCalls.map(t => (
                                                <span key={t} style={{
                                                    fontSize: '11px', padding: '3px 8px', borderRadius: '20px',
                                                    background: 'rgba(139,92,246,0.15)',
                                                    border: '1px solid rgba(139,92,246,0.3)',
                                                    color: '#a78bfa',
                                                }}>
                                                    ⚡ {toolLabel[t] || t}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Thinking block */}
                                    {msg.thinking && (
                                        <div>
                                            <button
                                                onClick={() => toggleThinking(msg.id)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '4px',
                                                    fontSize: '11px', color: 'var(--text-muted)',
                                                    background: 'none', border: 'none',
                                                    cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                                                }}
                                            >
                                                <Brain size={12} />
                                                {showThinking[msg.id] ? 'Ocultar raciocínio' : 'Ver raciocínio interno'}
                                                <ChevronDown size={12} style={{ transform: showThinking[msg.id] ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
                                            </button>
                                            {showThinking[msg.id] && (
                                                <div style={{
                                                    marginTop: '6px', padding: '10px 14px',
                                                    background: 'rgba(139,92,246,0.06)',
                                                    border: '1px solid rgba(139,92,246,0.2)',
                                                    borderRadius: '8px', fontSize: '12px',
                                                    color: 'var(--text-muted)', lineHeight: 1.6,
                                                    maxHeight: '200px', overflowY: 'auto',
                                                    whiteSpace: 'pre-wrap',
                                                }}>
                                                    {msg.thinking}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Message bubble */}
                                    <div style={{
                                        padding: '12px 16px', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
                                        background: msg.role === 'user'
                                            ? 'var(--gradient-primary)'
                                            : 'var(--bg-card)',
                                        border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                                        color: 'var(--text-primary)',
                                        fontSize: '14px', lineHeight: 1.7,
                                        whiteSpace: 'pre-wrap',
                                    }}>
                                        {msg.content || (msg.streaming ? '' : '...')}
                                        {msg.streaming && !msg.content && (
                                            <span style={{ display: 'inline-flex', gap: '3px', marginLeft: '4px' }}>
                                                {[0, 1, 2].map(i => (
                                                    <span key={i} style={{
                                                        width: '5px', height: '5px', borderRadius: '50%',
                                                        background: 'var(--text-muted)',
                                                        animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                                                        display: 'inline-block',
                                                    }} />
                                                ))}
                                            </span>
                                        )}
                                    </div>

                                    {/* Sugestões de ajuste (propor_ajuste) */}
                                    {msg.suggestions && msg.suggestions.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {msg.suggestions.map(s => {
                                                const state = suggestionState[s.id] || 'pending';
                                                return (
                                                    <div key={s.id} style={{
                                                        padding: '12px 14px', borderRadius: 10,
                                                        background: 'var(--bg-card)',
                                                        border: '1px solid var(--border)',
                                                        borderLeft: `3px solid ${state === 'applied' ? '#22c55e' : state === 'dismissed' ? 'var(--border)' : '#8b5cf6'}`,
                                                        fontSize: 13,
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                                                            <Zap size={13} color="#8b5cf6" />
                                                            <span style={{ fontWeight: 600 }}>{ACTION_LABEL[s.action]}</span>
                                                            <span style={{ color: 'var(--text-muted)' }}>· {s.campaign_name}</span>
                                                        </div>
                                                        <div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>{s.reason}</div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12.5 }}>
                                                            <span style={{ color: 'var(--text-muted)' }}>Atual: <b style={{ color: 'var(--text-primary)' }}>{fmtSuggestionValue(s.action, s.current_value)}</b></span>
                                                            <span style={{ color: 'var(--text-muted)' }}>→</span>
                                                            <span style={{ color: 'var(--text-muted)' }}>Sugerido: <b style={{ color: '#8b5cf6' }}>{fmtSuggestionValue(s.action, s.suggested_value)}</b></span>
                                                        </div>
                                                        {state === 'applied' ? (
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#22c55e', fontWeight: 600 }}>
                                                                <Check size={14} /> Aplicado
                                                            </span>
                                                        ) : state === 'dismissed' ? (
                                                            <span style={{ color: 'var(--text-muted)' }}>Descartado</span>
                                                        ) : (
                                                            <div style={{ display: 'flex', gap: 8 }}>
                                                                <button
                                                                    onClick={() => applySuggestion(s)}
                                                                    disabled={state === 'applying'}
                                                                    className="btn btn-sm"
                                                                    style={{ background: '#8b5cf6', color: '#fff', border: 'none' }}
                                                                >
                                                                    {state === 'applying' ? <Loader2 size={13} className="spinning" /> : <Zap size={13} />}
                                                                    {state === 'applying' ? 'Aplicando...' : 'Aplicar'}
                                                                </button>
                                                                <button
                                                                    onClick={() => dismissSuggestion(s)}
                                                                    disabled={state === 'applying'}
                                                                    className="btn btn-sm btn-secondary"
                                                                >
                                                                    <XCircle size={13} /> Descartar
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        <div ref={bottomRef} />
                    </div>
                )}
            </div>

            {/* Input */}
            <div style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--border)',
                background: 'var(--bg-card)',
                flexShrink: 0,
            }}>
                <div style={{ maxWidth: '760px', margin: '0 auto' }}>
                    {/* CSV preview badge */}
                    {csvFile && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            marginBottom: '8px', padding: '8px 12px',
                            background: 'rgba(59,130,246,0.08)',
                            border: '1px solid rgba(59,130,246,0.25)',
                            borderRadius: '10px', fontSize: '13px',
                        }}>
                            <FileSpreadsheet size={15} color="#60a5fa" />
                            <span style={{ color: '#60a5fa', fontWeight: 600 }}>{csvFile.name}</span>
                            <span style={{ color: 'var(--text-muted)' }}>
                                · {csvFile.content.split('\n').length} linhas
                            </span>
                            <button
                                onClick={() => setCsvFile(null)}
                                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            >
                                <X size={14} color="var(--text-muted)" />
                            </button>
                        </div>
                    )}

                    <div style={{
                        display: 'flex', gap: '10px', alignItems: 'flex-end',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border)',
                        borderRadius: '14px',
                        padding: '10px 12px',
                    }}>
                        {/* Hidden file input */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,text/csv"
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                        />

                        {/* CSV attach button */}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={loading}
                            title="Anexar CSV"
                            style={{
                                width: '32px', height: '32px', borderRadius: '8px',
                                border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                                background: csvFile ? 'rgba(59,130,246,0.15)' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0, marginBottom: '2px',
                            }}
                        >
                            <Paperclip size={16} color={csvFile ? '#60a5fa' : 'var(--text-muted)'} />
                        </button>

                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={csvFile ? 'O que quer saber sobre este CSV?' : 'Pergunte sobre suas campanhas, métricas, estratégias...'}
                            rows={1}
                            style={{
                                flex: 1, resize: 'none', border: 'none',
                                background: 'transparent', color: 'var(--text-primary)',
                                fontSize: '14px', lineHeight: 1.5, outline: 'none',
                                fontFamily: 'inherit', maxHeight: '120px', overflowY: 'auto',
                            }}
                            onInput={e => {
                                const el = e.currentTarget;
                                el.style.height = 'auto';
                                el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                            }}
                        />
                        <button
                            onClick={() => send(input)}
                            disabled={loading || !input.trim()}
                            style={{
                                width: '36px', height: '36px', borderRadius: '10px',
                                border: 'none', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                                background: loading || !input.trim() ? 'var(--bg-card)' : 'var(--gradient-primary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0, transition: 'background 0.2s',
                            }}
                        >
                            {loading
                                ? <Loader2 size={16} color="var(--text-muted)" style={{ animation: 'spin 1s linear infinite' }} />
                                : <Send size={16} color={input.trim() ? 'white' : 'var(--text-muted)'} />
                            }
                        </button>
                    </div>
                    <p style={{ textAlign: 'center', marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                        Enter para enviar · Shift+Enter para nova linha · O agente tem acesso aos seus dados de campanha
                    </p>
                </div>
            </div>

            <style>{`
                .spinning { animation: spin 1s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
            `}</style>
        </div>
    );
}
