'use client';

import Link from 'next/link';
import React, { useState } from 'react';
import {
    Zap, Check, X, MessageCircle, TrendingUp, ShieldCheck, Bot, Cloud,
    KanbanSquare, Target, ChevronDown, BarChart3, PieChart, Play,
    Sparkles, Building2, Users, Layers, Facebook, Search, ArrowRight,
    Clock, DollarSign, AlertTriangle, Star, Radio, Instagram, Calendar,
    FileText, Wallet, Activity, Share2, MessageSquare, Gauge, Plug,
    ClipboardList, Palette, Bell, Briefcase, Filter, Eye, Repeat,
    LineChart, Video, Image as ImageIcon, Send, Copy, Link2, RefreshCw,
    UserPlus, ListChecks, Tag,
} from 'lucide-react';

// Paleta lime consistente com o app
const C = {
    bg: '#0a0e1a',
    bgSoft: '#0d1220',
    card: '#111726',
    cardHover: '#151b2e',
    border: '#1e2942',
    text: '#f1f5f9',
    textMuted: '#94a3b8',
    textDim: '#64748b',
    primary: '#d3f100',
    primaryDark: '#a3d900',
    primaryGlow: 'rgba(211,241,0,.18)',
    green: '#22c55e',
    red: '#ef4444',
    purple: '#8b5cf6',
    blue: '#38bdf8',
};

export default function MarketingLP() {
    return (
        <div style={{ background: C.bg, color: C.text, minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
            <GlobalStyles />
            <Nav />
            <Hero />
            <TrustBar />
            <Problem />
            <Feature01 />
            <Feature02 />
            <Feature03 />
            <AlertsWhatsApp />
            <ReportsShowcase />
            <AllFeatures />
            <ReplacesTools />
            <Testimonials />
            <ForWho />
            <Pricing />
            <FAQ />
            <FinalCTA />
            <Footer />
        </div>
    );
}

// ─── GLOBAL STYLES ─────────────────────────────────────────────

function GlobalStyles() {
    return <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        @keyframes glow { 0%, 100% { box-shadow: 0 0 0 rgba(211,241,0,0); } 50% { box-shadow: 0 0 60px rgba(211,241,0,.2); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        /* Toggle switch — mostrando ligado + desligado alternando */
        @keyframes toggleFlip {
            0%, 45% { background: #22c55e; }
            50%, 95% { background: #64748b; }
            100% { background: #22c55e; }
        }
        @keyframes toggleKnob {
            0%, 45% { transform: translateX(14px); }
            50%, 95% { transform: translateX(0); }
            100% { transform: translateX(14px); }
        }
        /* Notification dot pulsando */
        @keyframes pulseDot {
            0%, 100% { box-shadow: 0 0 0 0 rgba(211,241,0,.55); }
            50% { box-shadow: 0 0 0 8px rgba(211,241,0,0); }
        }
        /* Mensagem entrando (WhatsApp bubbles) — stagger via delay */
        @keyframes msgIn {
            0% { opacity: 0; transform: translateY(12px) scale(.95); }
            100% { opacity: 1; transform: none; }
        }
        /* Radar/status dot piscando devagar */
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
        /* Barrinha crescendo (KPI) */
        @keyframes barGrow { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
        .anim-toggle-on  { animation: toggleFlip 3.4s ease-in-out infinite; }
        .anim-toggle-knob { animation: toggleKnob 3.4s ease-in-out infinite; }
        .anim-pulse-dot  { animation: pulseDot 2s ease-out infinite; }
        .anim-blink      { animation: blink 1.6s ease-in-out infinite; }
        .anim-bar-grow   { transform-origin: left center; animation: barGrow 1.4s cubic-bezier(.6,.05,.3,1) both; }
        .msg-in-1 { animation: msgIn .5s ease-out .1s both; }
        .msg-in-2 { animation: msgIn .5s ease-out .5s both; }
        .msg-in-3 { animation: msgIn .5s ease-out .9s both; }
        @media (prefers-reduced-motion: reduce) {
            .anim-toggle-on, .anim-toggle-knob, .anim-pulse-dot, .anim-blink,
            .msg-in-1, .msg-in-2, .msg-in-3, .anim-bar-grow { animation: none !important; }
        }
        .plan-popular { animation: glow 3s ease-in-out infinite; }
        .fade-in { animation: fadeIn .6s ease both; }
        .marquee { animation: marquee 30s linear infinite; }
        .btn-primary { transition: transform .2s, box-shadow .2s; }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 32px ${C.primaryGlow} !important; }
        .btn-secondary:hover { border-color: ${C.primary} !important; }
        .feat-item:hover { border-color: ${C.primary} !important; }
        .faq-item summary::marker { display: none; }
        .faq-item summary::-webkit-details-marker { display: none; }
        .faq-item[open] summary svg { transform: rotate(180deg); }
        .mockup-glow { box-shadow: 0 30px 80px -20px rgba(211,241,0,.25), 0 0 100px -20px rgba(139,92,246,.15); }
        @media (max-width: 768px) {
            .hero-grid { grid-template-columns: 1fr !important; }
            .hero-mockup { display: none !important; }
            .feat-grid { grid-template-columns: 1fr !important; }
            .feat-grid-rev { grid-template-columns: 1fr !important; }
            .stack-mobile { grid-template-columns: 1fr !important; }
            .container { padding-left: 20px !important; padding-right: 20px !important; }
            .nav-menu { display: none !important; }
        }
    `}</style>;
}

// ─── NAV ────────────────────────────────────────────────────────

function Nav() {
    return (
        <nav style={{
            position: 'sticky', top: 0, zIndex: 50,
            background: `${C.bg}dd`, backdropFilter: 'blur(20px)',
            borderBottom: `1px solid ${C.border}`,
        }}>
            <div className="container" style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 9,
                        background: `linear-gradient(135deg, ${C.primaryDark}, ${C.primary})`,
                        display: 'grid', placeItems: 'center', fontWeight: 900, color: C.bg, fontSize: 15,
                    }}>T</div>
                    <span style={{ fontWeight: 900, fontSize: 17 }}>TrafficAI</span>
                </div>
                <div className="nav-menu" style={{ display: 'flex', gap: 28, alignItems: 'center', fontSize: 14 }}>
                    <a href="#features" style={{ color: C.textMuted, textDecoration: 'none', fontWeight: 500 }}>Funcionalidades</a>
                    <a href="#depoimentos" style={{ color: C.textMuted, textDecoration: 'none', fontWeight: 500 }}>Depoimentos</a>
                    <a href="#planos" style={{ color: C.textMuted, textDecoration: 'none', fontWeight: 500 }}>Planos</a>
                    <a href="#faq" style={{ color: C.textMuted, textDecoration: 'none', fontWeight: 500 }}>Perguntas</a>
                </div>
                <Link href="/" className="btn-primary" style={{
                    padding: '9px 18px', background: C.primary, color: C.bg,
                    borderRadius: 8, textDecoration: 'none', fontWeight: 800, fontSize: 13.5,
                }}>Começar grátis</Link>
            </div>
        </nav>
    );
}

// ─── HERO ──────────────────────────────────────────────────────

function Hero() {
    return (
        <section style={{ padding: '80px 0 60px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -100, left: '10%', width: 500, height: 500, background: `radial-gradient(circle, ${C.primaryGlow} 0%, transparent 60%)`, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: 100, right: '5%', width: 400, height: 400, background: 'radial-gradient(circle, rgba(139,92,246,.12) 0%, transparent 60%)', pointerEvents: 'none' }} />

            <div className="container" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', position: 'relative' }}>
                <div className="hero-grid" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 60, alignItems: 'center' }}>
                    <div className="fade-in">
                        <div style={{
                            display: 'inline-block', padding: '5px 14px', background: C.primaryGlow,
                            border: `1px solid ${C.primary}55`, borderRadius: 999,
                            fontSize: 11, color: C.primary, marginBottom: 24,
                            letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 800,
                        }}>
                            ⚡ 20% mais barato que o AdsDaily · +14 features exclusivas
                        </div>
                        <h1 style={{
                            fontSize: 'clamp(34px, 5vw, 56px)', fontWeight: 900,
                            lineHeight: 1.05, margin: '0 0 20px', letterSpacing: '-0.03em',
                        }}>
                            Seu cliente recebe o relatório no WhatsApp sozinho.{' '}
                            <span style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                Você recupera suas manhãs.
                            </span>
                        </h1>
                        <p style={{ fontSize: 17, color: C.textMuted, lineHeight: 1.5, marginBottom: 32, maxWidth: 520 }}>
                            Acompanhe status e ads em uma só tela e envie relatórios automáticos no WhatsApp. Menos operação manual, mais tempo para estratégia e escala.
                        </p>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            <Link href="/" className="btn-primary" style={{
                                padding: '15px 30px', background: C.primary, color: C.bg,
                                borderRadius: 10, textDecoration: 'none', fontWeight: 800,
                                fontSize: 15, boxShadow: `0 8px 24px ${C.primaryGlow}`,
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                            }}>
                                Testar 7 dias grátis <ArrowRight size={16} />
                            </Link>
                            <a href="#features" className="btn-secondary" style={{
                                padding: '15px 30px', border: `1px solid ${C.border}`, color: C.text,
                                borderRadius: 10, textDecoration: 'none', fontWeight: 700,
                                fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 8,
                            }}>
                                <Play size={14} fill={C.text} /> Ver como funciona
                            </a>
                        </div>
                        <div style={{ marginTop: 24, display: 'flex', gap: 20, fontSize: 12.5, color: C.textDim, flexWrap: 'wrap' }}>
                            <span>✓ Sem cartão</span>
                            <span>✓ Cancelamento na hora</span>
                            <span>✓ Setup em 5 min</span>
                        </div>
                    </div>
                    <div className="hero-mockup fade-in">
                        <HeroMockup />
                    </div>
                </div>
            </div>
        </section>
    );
}

function HeroMockup() {
    return (
        <div style={{ position: 'relative', maxWidth: 520, marginLeft: 'auto' }}>
            {/* Dashboard mockup principal */}
            <div className="mockup-glow" style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
                overflow: 'hidden', padding: 16,
            }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
                </div>
                <div style={{ background: C.bg, borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700, marginBottom: 8 }}>Cliente exemplo · Últimos 7 dias</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
                        {[
                            { label: 'Invest.', val: 'R$ 970' },
                            { label: 'Conversas', val: '256' },
                            { label: 'CPA', val: 'R$ 3,79' },
                        ].map(m => (
                            <div key={m.label} style={{ background: C.card, padding: 8, borderRadius: 6, border: `1px solid ${C.border}` }}>
                                <div style={{ fontSize: 8.5, color: C.textDim, textTransform: 'uppercase', fontWeight: 700 }}>{m.label}</div>
                                <div style={{ fontSize: 15, fontWeight: 900, color: C.text, marginTop: 2 }}>{m.val}</div>
                            </div>
                        ))}
                    </div>
                    <div style={{ height: 60, background: `linear-gradient(to top, ${C.primary}22, transparent)`, borderRadius: 6, display: 'flex', alignItems: 'flex-end', gap: 3, padding: 4 }}>
                        {[40, 55, 30, 70, 45, 85, 60].map((h, i) => (
                            <div key={i} style={{ flex: 1, height: `${h}%`, background: `linear-gradient(to top, ${C.primaryDark}, ${C.primary})`, borderRadius: '2px 2px 0 0' }} />
                        ))}
                    </div>
                </div>
            </div>
            {/* Phone mockup */}
            <div style={{
                position: 'absolute', bottom: -30, right: -20, width: 180,
                background: C.card, borderRadius: 24, padding: 8,
                border: `2px solid ${C.border}`, boxShadow: '0 20px 60px rgba(0,0,0,.6)',
            }}>
                <div style={{ background: '#075E54', borderRadius: 18, padding: 10, fontSize: 10, color: '#fff' }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>💬 Cliente exemplo</div>
                    <div style={{ background: '#128C7E', padding: 8, borderRadius: 10, marginBottom: 6, lineHeight: 1.4 }}>
                        <b>Bom dia! 📊</b><br />
                        Resumo de ontem:<br />
                        💰 R$ 148 · 25 conversas<br />
                        📄 Relatório completo:<br />
                        <u>app.alfamax.../r/pdf/...</u>
                    </div>
                    <div style={{ fontSize: 8, opacity: 0.6, textAlign: 'right' }}>08:00 ✓✓</div>
                </div>
            </div>
        </div>
    );
}

// ─── TRUST BAR ─────────────────────────────────────────────────

function TrustBar() {
    const brands = ['Automotivo', 'E-commerce', 'Educação', 'Saúde', 'Imobiliário', 'Serviços', 'B2B SaaS', 'Beleza', 'Alimentação'];
    const list = [...brands, ...brands]; // duplica pra marquee infinito
    return (
        <section style={{ padding: '32px 0', borderBlock: `1px solid ${C.border}`, overflow: 'hidden' }}>
            <div className="container" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: C.textDim, letterSpacing: '.15em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 20 }}>
                    Nichos que já usam o TrafficAI
                </div>
                <div style={{ overflow: 'hidden', maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)' }}>
                    <div className="marquee" style={{ display: 'flex', gap: 48, whiteSpace: 'nowrap' }}>
                        {list.map((b, i) => (
                            <div key={i} style={{ fontSize: 18, fontWeight: 700, color: C.textDim, opacity: 0.7 }}>{b}</div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

// ─── PROBLEMA ──────────────────────────────────────────────────

function Problem() {
    return (
        <section style={{ padding: '80px 0' }}>
            <div className="container" style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px' }}>
                <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 34px)', fontWeight: 800, textAlign: 'center', lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: 12 }}>
                    O problema não é criar campanhas.<br />
                    <span style={{ color: C.textMuted, fontWeight: 500 }}>É o tempo que a operação consome antes de você chegar no que importa.</span>
                </h2>

                <div className="feat-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 40 }}>
                    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, color: C.red }}>
                            <AlertTriangle size={20} />
                            <div style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 800 }}>Antes</div>
                        </div>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 14 }}>
                            {[
                                'Painel bonito não paga boleto',
                                'Cliente pede relatório e você para tudo',
                                'CPA disparou? Você descobre 2 dias depois',
                                'Print de gráfico no grupo do WhatsApp',
                                'Cliente reclama que "não sabe o que tá acontecendo"',
                            ].map((t, i) => (
                                <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: C.textMuted }}>
                                    <X size={16} color={C.red} style={{ flexShrink: 0, marginTop: 2 }} />
                                    <span>{t}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div style={{
                        background: `linear-gradient(135deg, ${C.card}, ${C.primaryGlow})`,
                        border: `1px solid ${C.primary}44`, borderRadius: 14, padding: 28,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, color: C.primary }}>
                            <Check size={20} />
                            <div style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 800 }}>Depois do TrafficAI</div>
                        </div>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 14 }}>
                            {[
                                'Cliente recebe relatório todo dia 8h',
                                'Você acorda com CPA sob controle',
                                'Automação pausa ad ruim em 15 min',
                                'Print? Link visual + PDF por cliente',
                                'Cliente vê tudo em tempo real, sozinho',
                            ].map((t, i) => (
                                <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: C.text }}>
                                    <Check size={16} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
                                    <span>{t}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </section>
    );
}

// ─── FEATURE BLOCKS ────────────────────────────────────────────

function Feature01() {
    return (
        <FeatureBlock
            number="01"
            tag="MONITORAMENTO"
            title="Monitoramento em tempo real do Meta e Google Ads"
            desc="Veja tudo o que está rodando em uma única tela. Sync horário, alertas de saldo antes da campanha pausar, e ranking automático dos criativos que mais performam."
            items={[
                'Dashboard com status de todas as campanhas em tempo real',
                'Dashboard com saldo de todas as contas de anúncios',
                'Automação de saldo com disparo WhatsApp',
                'Automação de status de campanha com disparo WhatsApp',
                'Google Ads via MCC (multi-conta)',
            ]}
            mockup={<DashboardMockup />}
            reverse={false}
        />
    );
}

function Feature02() {
    return (
        <FeatureBlock
            number="02"
            tag="OPERAÇÃO"
            title="Operação mais ágil de campanhas"
            desc="Pause, ative, mude budget e duplique campanhas direto do TrafficAI. Regras SE/ENTÃO cuidam do trivial. Você foca em estratégia."
            items={[
                'Criação de anúncios direto do painel',
                'Duplicação de anúncios em 1 clique',
                'Edição de plataforma de anúncios (Meta + Google)',
                'Alteração de orçamento a nível de campanha, conjunto e anúncio',
                'Automação SE/ENTÃO com trigger WhatsApp',
            ]}
            mockup={<AutomationMockup />}
            reverse={true}
        />
    );
}

function Feature03() {
    return (
        <FeatureBlock
            number="03"
            tag="RELATÓRIOS"
            title="Relatórios e comunicação automatizada"
            desc="Agende o envio, use IA pra escrever a mensagem, e mande o link do relatório visual completo. Cliente abre no celular e entende tudo."
            items={[
                'Geração de relatórios diários automatizados',
                'Disparo de relatórios diários, semanais e mensais no WhatsApp',
                'Disparo de top criativos automatizado',
                'Relatório visual com breakdowns (posicionamento, dispositivo, idade, região)',
                'Aprovação de relatório antes do envio (workflow)',
            ]}
            mockup={<WhatsAppMockup />}
            reverse={false}
        />
    );
}

function FeatureBlock({ number, tag, title, desc, items, mockup, reverse }: {
    number: string; tag: string; title: string; desc: string; items: string[]; mockup: React.ReactNode; reverse: boolean;
}) {
    return (
        <section id={number === '01' ? 'features' : undefined} style={{ padding: '80px 0', borderTop: `1px solid ${C.border}` }}>
            <div className="container" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
                <div
                    className={reverse ? 'feat-grid-rev' : 'feat-grid'}
                    style={{
                        display: 'grid',
                        gridTemplateColumns: reverse ? '1fr 1.1fr' : '1.1fr 1fr',
                        gap: 60, alignItems: 'center',
                        direction: reverse ? 'rtl' : 'ltr',
                    }}
                >
                    <div style={{ direction: 'ltr' }}>
                        <div style={{ fontSize: 64, fontWeight: 900, color: C.primary, lineHeight: 1, marginBottom: 6, opacity: 0.6 }}>{number}</div>
                        <div style={{ fontSize: 11, color: C.primary, letterSpacing: '.15em', textTransform: 'uppercase', fontWeight: 800, marginBottom: 10 }}>{tag}</div>
                        <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 34px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 16 }}>
                            {title}
                        </h2>
                        <p style={{ fontSize: 15.5, color: C.textMuted, lineHeight: 1.6, marginBottom: 24 }}>{desc}</p>
                        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'grid', gap: 12 }}>
                            {items.map((it, i) => (
                                <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: C.text }}>
                                    <Check size={16} color={C.primary} style={{ flexShrink: 0, marginTop: 3 }} />
                                    <span>{it}</span>
                                </li>
                            ))}
                        </ul>
                        <Link href="/" className="btn-primary" style={{
                            padding: '12px 24px', background: C.primary, color: C.bg,
                            borderRadius: 8, textDecoration: 'none', fontWeight: 800, fontSize: 13.5,
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}>
                            Testar 7 dias grátis <ArrowRight size={14} />
                        </Link>
                    </div>
                    <div style={{ direction: 'ltr' }}>
                        {mockup}
                    </div>
                </div>
            </div>
        </section>
    );
}

// ─── MOCKUPS ───────────────────────────────────────────────────

function DashboardMockup() {
    // Cores dos avatares — usadas em várias mockups
    const avatars = [
        { name: 'VM', bg: '#8b5cf6', label: 'Vítor Monteiro', highlight: true,  status: 'Ativa', spend: 'R$ 3.750' },
        { name: 'AL', bg: '#f97316', label: 'Ariana Leite',   highlight: false, status: 'Ativa', spend: 'R$ 500' },
        { name: 'AC', bg: '#38bdf8', label: 'Attivare Contabilidade', highlight: false, status: 'Ativa', spend: 'R$ 1.580' },
        { name: 'CT', bg: '#22c55e', label: 'Carlos Taira',   highlight: false, status: 'Ativa', spend: 'R$ 7.580' },
        { name: 'MB', bg: '#ef4444', label: 'Mariana Braga',  highlight: false, status: 'Ativa', spend: 'R$ 2.140' },
    ];
    return (
        <div className="mockup-glow" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            {/* Top bar */}
            <div style={{ background: C.bg, padding: 12, borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                </div>
                <div style={{
                    marginLeft: 8, flex: 1,
                    padding: '4px 10px', background: C.card, borderRadius: 6,
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 10.5, color: C.textMuted,
                }}>
                    <Search size={11} /> Buscar cliente
                    <span style={{ marginLeft: 'auto', fontSize: 9, background: C.border, padding: '1px 6px', borderRadius: 3 }}>⌘K</span>
                </div>
            </div>

            {/* Body: sidebar + main */}
            <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr', minHeight: 340 }}>
                {/* Sidebar */}
                <div style={{ background: C.bg, borderRight: `1px solid ${C.border}`, padding: '14px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 8, color: C.textDim, fontWeight: 700, letterSpacing: '.15em', marginBottom: 4 }}>ADS</div>
                    <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: `linear-gradient(135deg, ${C.primaryDark}, ${C.primary})`,
                        display: 'grid', placeItems: 'center',
                    }}>
                        <Facebook size={15} color={C.bg} />
                    </div>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: C.card, display: 'grid', placeItems: 'center' }}>
                        <Search size={14} color={C.textMuted} />
                    </div>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: C.card, display: 'grid', placeItems: 'center' }}>
                        <Filter size={13} color={C.textMuted} />
                    </div>
                    <div style={{ fontSize: 8, color: C.textDim, fontWeight: 700, letterSpacing: '.15em', marginTop: 8, marginBottom: 4 }}>WORK</div>
                    {[KanbanSquare, ClipboardList, Calendar, BarChart3, Wallet].map((Icon, i) => (
                        <div key={i} style={{ width: 32, height: 32, borderRadius: 8, background: C.card, display: 'grid', placeItems: 'center' }}>
                            <Icon size={13} color={C.textMuted} />
                        </div>
                    ))}
                </div>

                {/* Main content */}
                <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Meta Ads</div>
                        <span className="anim-pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: C.primary, marginLeft: 4 }} />
                    </div>
                    <div style={{ fontSize: 10.5, color: C.textMuted, marginBottom: 14 }}>Gerencie suas campanhas</div>

                    {/* Toggle Tabela/Kanban */}
                    <div style={{ display: 'inline-flex', background: C.bg, borderRadius: 6, padding: 2, marginBottom: 14, border: `1px solid ${C.border}` }}>
                        <div style={{ padding: '5px 12px', background: C.card, borderRadius: 4, fontSize: 10.5, fontWeight: 700, color: C.text, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <Layers size={10} /> Tabela
                        </div>
                        <div style={{ padding: '5px 12px', fontSize: 10.5, fontWeight: 500, color: C.textDim, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <KanbanSquare size={10} /> Kanban
                        </div>
                    </div>

                    {/* Filters row */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                        <div style={{ padding: 6, background: C.bg, borderRadius: 5, border: `1px solid ${C.border}` }}>
                            <Search size={11} color={C.blue} />
                        </div>
                        <div style={{ padding: 6, background: C.bg, borderRadius: 5, border: `1px solid ${C.border}` }}>
                            <Filter size={11} color={C.blue} />
                        </div>
                    </div>

                    {/* Header linha */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 65px 75px', fontSize: 9.5, color: C.textDim, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700, marginBottom: 6, padding: '0 4px' }}>
                        <span>Cliente</span>
                        <span>Status</span>
                        <span style={{ textAlign: 'right' }}>Investim.</span>
                    </div>

                    {avatars.map((a, i) => (
                        <div key={i} style={{
                            display: 'grid', gridTemplateColumns: '1fr 65px 75px', gap: 8, alignItems: 'center',
                            padding: '9px 6px',
                            borderBottom: i < avatars.length - 1 ? `1px solid ${C.border}` : 'none',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                <div style={{
                                    width: 22, height: 22, borderRadius: 6, background: a.bg,
                                    display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 800, color: '#fff',
                                    flexShrink: 0,
                                }}>{a.name}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, overflow: 'hidden' }}>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.label}</span>
                                    {a.highlight && (
                                        <span style={{
                                            fontSize: 8.5, fontWeight: 700,
                                            padding: '1px 5px', borderRadius: 3,
                                            background: 'rgba(211,241,0,.15)', color: C.primary,
                                            display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0,
                                        }}>
                                            <Star size={7} /> Destaque
                                        </span>
                                    )}
                                </div>
                            </div>
                            <span style={{
                                fontSize: 9.5, fontWeight: 700, color: C.green,
                                padding: '2px 7px', borderRadius: 12,
                                background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.28)',
                                textAlign: 'center', justifySelf: 'start',
                            }}>{a.status}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.text, textAlign: 'right' }}>{a.spend}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function AutomationMockup() {
    const ads = [
        { title: '02. Começou a chover',                              id: '120242935915260564', color: '#8b5cf6', on: true },
        { title: '01. Resultado natural? Mesmo anos depois',          id: '120242934664330564', color: '#22c55e', on: true },
        { title: '03. Aqui, a consulta não é apenas uma consulta',    id: '120242935990700564', color: '#38bdf8', on: true, animated: true },
        { title: '04. Antes x depois',                                 id: '120242936015210564', color: '#f97316', on: true },
        { title: '05. A blefaroplastia',                               id: '120242936015500564', color: '#ec4899', on: false, dim: true },
    ];
    return (
        <div className="mockup-glow" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            {/* Group row: WPP */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', borderBottom: `1px solid ${C.border}`, background: C.bg,
            }}>
                <ChevronDown size={13} color={C.textMuted} />
                <Toggle on />
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>
                        <span style={{ color: C.textMuted }}>[WPP]</span> <span style={{ color: C.primary }}>[26/03]</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.textDim, marginTop: 1 }}>5 anúncios</div>
                </div>
                <FileText size={12} color={C.textDim} />
            </div>

            {/* Section label */}
            <div style={{ padding: '10px 16px 4px', fontSize: 9, color: C.textDim, letterSpacing: '.15em', fontWeight: 700 }}>ANÚNCIO</div>

            {/* Header row: TERESINA */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px 8px 24px' }}>
                <ChevronDown size={13} color={C.textMuted} />
                <Toggle on />
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>TERESINA+ 50KM MAIS</span>
                        <Target size={11} color={C.primary} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <span style={{ fontSize: 10, color: C.textDim }}>5 anúncios</span>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: 10, color: C.text, fontWeight: 600,
                            padding: '3px 8px', borderRadius: 5,
                            background: C.card, border: `1px solid ${C.border}`,
                        }}>
                            <Calendar size={10} color={C.textDim} /> ABO Diário: R$ 17,00 /dia
                        </span>
                    </div>
                </div>
            </div>

            {/* Ad list */}
            <div style={{ padding: '4px 16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ads.map((ad, i) => (
                    <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px',
                        background: ad.dim ? C.bg : C.card,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        opacity: ad.dim ? 0.55 : 1,
                    }}>
                        {/* Thumb */}
                        <div style={{
                            width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                            background: `linear-gradient(135deg, ${ad.color}, ${ad.color}88)`,
                            display: 'grid', placeItems: 'center',
                            position: 'relative', overflow: 'hidden',
                        }}>
                            <ImageIcon size={14} color="#fff" style={{ opacity: .8 }} />
                        </div>
                        {/* Toggle */}
                        {ad.animated ? <ToggleAnimated /> : <Toggle on={ad.on} />}
                        {/* Text */}
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{
                                fontSize: 11, fontWeight: 700, color: C.text,
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>{ad.title}</div>
                            <div style={{ fontSize: 9.5, color: C.textDim, marginTop: 1 }}>ID: {ad.id}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Toggle estático (verde on / cinza off)
function Toggle({ on }: { on: boolean }) {
    return (
        <div style={{
            width: 30, height: 16, borderRadius: 20, flexShrink: 0,
            background: on ? '#22c55e' : '#64748b',
            position: 'relative', transition: 'background .2s',
        }}>
            <div style={{
                position: 'absolute', top: 2, left: on ? 16 : 2,
                width: 12, height: 12, borderRadius: '50%', background: '#fff',
                transition: 'left .2s',
            }} />
        </div>
    );
}

// Toggle animado (loop on/off)
function ToggleAnimated() {
    return (
        <div className="anim-toggle-on" style={{
            width: 30, height: 16, borderRadius: 20, flexShrink: 0,
            background: '#22c55e', position: 'relative',
        }}>
            <div className="anim-toggle-knob" style={{
                position: 'absolute', top: 2, left: 2,
                width: 12, height: 12, borderRadius: '50%', background: '#fff',
            }} />
        </div>
    );
}

function WhatsAppMockup() {
    return (
        <div style={{ maxWidth: 320, margin: '0 auto' }}>
            {/* iPhone frame */}
            <div className="mockup-glow" style={{
                background: '#000',
                border: `10px solid #1a1a1a`,
                borderRadius: 40,
                padding: 0,
                boxShadow: '0 30px 80px -10px rgba(211,241,0,.22), inset 0 0 0 2px #2a2a2a',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* Dynamic island */}
                <div style={{
                    position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
                    width: 88, height: 22, borderRadius: 20, background: '#000', zIndex: 5,
                }} />

                {/* Chat header */}
                <div style={{
                    background: '#075E54', padding: '32px 14px 12px', display: 'flex', gap: 10, alignItems: 'center',
                }}>
                    <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: `linear-gradient(135deg, ${C.primaryDark}, ${C.primary})`,
                        display: 'grid', placeItems: 'center', fontWeight: 900, color: C.bg, fontSize: 12,
                    }}>LF</div>
                    <div>
                        <div style={{ fontSize: 13.5, color: '#fff', fontWeight: 700 }}>Lançamento Fitch</div>
                        <div style={{ fontSize: 10, color: '#8ba8a3', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span className="anim-blink" style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                            online
                        </div>
                    </div>
                </div>

                {/* Chat body */}
                <div style={{
                    padding: '18px 12px 22px',
                    background: '#0B141B',
                    minHeight: 340,
                    backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(211,241,0,.03) 0%, transparent 40%)',
                }}>
                    {/* System msg */}
                    <div className="msg-in-1" style={{
                        display: 'block', margin: '0 auto 12px', textAlign: 'center',
                        fontSize: 9.5, color: '#8ba8a3',
                        background: 'rgba(0,0,0,.35)', padding: '4px 10px', borderRadius: 8,
                        maxWidth: 'fit-content',
                    }}>3 mensagens separadas</div>

                    {/* Msg 1 — compact daily */}
                    <div className="msg-in-2" style={{
                        background: '#005C4B', color: '#fff', padding: '10px 12px',
                        borderRadius: '12px 12px 0 12px',
                        maxWidth: '82%', marginLeft: 'auto',
                        fontSize: 12, lineHeight: 1.55,
                    }}>
                        <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 13 }}>📊</span> Relatório Diário — Fitch
                        </div>
                        <div>📅 Data: 20/06/2026</div>
                        <div>💰 Investimento: R$ 600,00</div>
                        <div>🏦 Saldo conta: R$ 43,87</div>
                        <div style={{ fontSize: 9, color: '#8ba8a3', textAlign: 'right', marginTop: 4 }}>16:36 ✓✓</div>
                    </div>

                    {/* Msg 2 — Top criativos */}
                    <div className="msg-in-3" style={{
                        marginTop: 8,
                        background: '#005C4B', color: '#fff', padding: '10px 12px',
                        borderRadius: '12px 12px 0 12px',
                        maxWidth: '82%', marginLeft: 'auto',
                        fontSize: 12, lineHeight: 1.55,
                    }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>🏆 Top 3 criativos</div>
                        <div>🥇 Antes x depois · R$ 32,24</div>
                        <div>🥈 Consulta VIP · R$ 20,75</div>
                        <div>🥉 Depoimento Dra. · R$ 20,61</div>
                        <div style={{ fontSize: 9, color: '#8ba8a3', textAlign: 'right', marginTop: 4 }}>16:36 ✓✓</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── ALERTAS NO WHATSAPP ───────────────────────────────────────

function AlertsWhatsApp() {
    const alerts = [
        {
            text: 'A campanha X está inativa.',
            delay: '.1s',
        },
        {
            text: 'O saldo da campanha está abaixo de R$ 100,00.',
            delay: '.35s',
        },
        {
            text: 'Oi Dra. Ana! O saldo da conta de anúncios está abaixo de R$ 150,00. Posso te enviar o Pix?',
            delay: '.6s',
        },
    ];

    return (
        <section style={{ padding: '90px 0 100px', background: `linear-gradient(180deg, ${C.bg}, ${C.bgSoft}, ${C.bg})`, borderTop: `1px solid ${C.border}` }}>
            <div className="container" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: C.green, letterSpacing: '.15em', textTransform: 'uppercase', fontWeight: 800, marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className="anim-blink" style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
                    Alertas no WhatsApp
                </div>
                <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 14 }}>
                    O cliente e o time <span style={{ color: C.primary }}>sabem na hora</span>
                </h2>
                <p style={{ fontSize: 15.5, color: C.textMuted, maxWidth: 640, margin: '0 auto 56px', lineHeight: 1.6 }}>
                    Exemplos de avisos que o TrafficAI dispara automaticamente, no tom que você configurar.
                </p>

                {/* Balões distribuídos */}
                <div
                    className="alerts-grid"
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 24,
                        maxWidth: 1080,
                        margin: '0 auto',
                        alignItems: 'flex-start',
                    }}
                >
                    {alerts.map((a, i) => (
                        <div key={i}
                            style={{
                                display: 'flex', gap: 10, alignItems: 'flex-start',
                                justifyContent: i === 0 ? 'flex-start' : i === 1 ? 'center' : 'flex-end',
                                animation: `msgIn .6s ease-out ${a.delay} both`,
                            }}>
                            {/* Icon WhatsApp */}
                            <div style={{
                                width: 34, height: 34, borderRadius: '50%',
                                background: '#25D366', color: '#fff',
                                display: 'grid', placeItems: 'center', flexShrink: 0,
                                boxShadow: '0 4px 14px rgba(37,211,102,.35)',
                            }}>
                                <MessageCircle size={17} />
                            </div>
                            {/* Bubble */}
                            <div style={{
                                background: '#111827', color: '#e5f6ec',
                                padding: '12px 16px',
                                borderRadius: '4px 14px 14px 14px',
                                fontSize: 13.5, lineHeight: 1.55,
                                border: `1px solid ${C.border}`,
                                textAlign: 'left',
                                maxWidth: 320,
                                position: 'relative',
                            }}>
                                {a.text}
                                {/* Tail — cantinho do balão */}
                                <div style={{
                                    position: 'absolute', top: 0, left: -6,
                                    width: 0, height: 0,
                                    borderTop: '8px solid #111827',
                                    borderLeft: '6px solid transparent',
                                }} />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Config note */}
                <div style={{ marginTop: 60, fontSize: 13, color: C.textDim, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Bell size={13} color={C.primary} />
                    Você define quais eventos disparam, para quem e em qual grupo/número
                </div>
            </div>

            <style>{`
                @media (max-width: 900px) {
                    .alerts-grid { grid-template-columns: 1fr !important; gap: 18px !important; max-width: 400px !important; }
                    .alerts-grid > div { justify-content: flex-start !important; }
                }
            `}</style>
        </section>
    );
}

// ─── COMPARISON ────────────────────────────────────────────────

// ─── REPORTS SHOWCASE (mockups ricos da parte forte) ──────────

function ReportsShowcase() {
    return (
        <section id="relatorios-showcase" style={{ padding: '80px 0', background: `linear-gradient(180deg, ${C.bg}, ${C.bgSoft}, ${C.bg})`, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 200, left: '5%', width: 500, height: 500, background: `radial-gradient(circle, ${C.primaryGlow} 0%, transparent 65%)`, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: 0, right: '5%', width: 500, height: 500, background: 'radial-gradient(circle, rgba(139,92,246,.12) 0%, transparent 65%)', pointerEvents: 'none' }} />

            <div className="container" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', position: 'relative' }}>
                <div style={{ textAlign: 'center', marginBottom: 56 }}>
                    <div style={{ display: 'inline-block', padding: '5px 14px', background: C.primaryGlow, border: `1px solid ${C.primary}55`, borderRadius: 999, fontSize: 11, color: C.primary, marginBottom: 16, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 800 }}>
                        📊 Nossa maior força
                    </div>
                    <h2 style={{ fontSize: 'clamp(30px, 4.5vw, 44px)', fontWeight: 900, marginBottom: 16, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                        Relatórios que <span style={{ color: C.primary }}>vendem contrato</span>
                    </h2>
                    <p style={{ color: C.textMuted, fontSize: 16, maxWidth: 620, margin: '0 auto', lineHeight: 1.5 }}>
                        Do WhatsApp diário ao dashboard visual completo com breakdowns por posicionamento, dispositivo e demografia. Cliente entende, cliente renova.
                    </p>
                </div>

                {/* Mockup 1: FULL VISUAL REPORT — full width */}
                <div style={{ marginBottom: 60 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: C.primary, color: C.bg, display: 'grid', placeItems: 'center', fontWeight: 900 }}>1</div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Relatório Visual Completo</h3>
                            <div style={{ fontSize: 13, color: C.textMuted }}>Link único que cliente abre no celular · dark theme profissional · 61KB de HTML self-contained</div>
                        </div>
                    </div>
                    <FullVisualReport />
                </div>

                {/* Grid 2 col: WhatsApp + Templates */}
                <div className="feat-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 60 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#22c55e', color: C.bg, display: 'grid', placeItems: 'center', fontWeight: 900 }}>2</div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>WhatsApp diário</h3>
                                <div style={{ fontSize: 12, color: C.textMuted }}>Dispara sozinho no horário configurado</div>
                            </div>
                        </div>
                        <FullWhatsAppMockup />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: C.purple, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900 }}>3</div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Templates library</h3>
                                <div style={{ fontSize: 12, color: C.textMuted }}>Reutilize e personalize por cliente</div>
                            </div>
                        </div>
                        <TemplatesLibraryMockup />
                    </div>
                </div>

                {/* Mockup 4: Approval workflow */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f59e0b', color: C.bg, display: 'grid', placeItems: 'center', fontWeight: 900 }}>4</div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Workflow de aprovação</h3>
                            <div style={{ fontSize: 12, color: C.textMuted }}>Dono aprova antes de mandar pro cliente</div>
                        </div>
                    </div>
                    <ApprovalFlow />
                </div>

                {/* CTA */}
                <div style={{ textAlign: 'center', marginTop: 56, padding: 32, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Impressionado?</div>
                    <div style={{ fontSize: 14, color: C.textMuted, marginBottom: 20 }}>
                        Gere seu primeiro relatório em 5 minutos com suas contas reais.
                    </div>
                    <Link href="/" className="btn-primary" style={{
                        padding: '14px 32px', background: C.primary, color: C.bg,
                        borderRadius: 10, textDecoration: 'none', fontWeight: 800, fontSize: 14,
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        boxShadow: `0 8px 24px ${C.primaryGlow}`,
                    }}>
                        Testar 7 dias grátis <ArrowRight size={14} />
                    </Link>
                </div>
            </div>
        </section>
    );
}

// ─── MOCKUP: FULL VISUAL REPORT ────────────────────────────────

function FullVisualReport() {
    // Criativos genéricos anônimos — só mostram estrutura visual do relatório
    const creatives = [
        {
            name: 'Criativo A',
            conv: 87, spend: 240.50, cpa: 2.76, ctr: 3.20,
            adType: 'image',
            title: 'Oferta relâmpago',
            badge: 'IMAGEM · A/B TEST',
            bg: 'linear-gradient(135deg,#1e293b,#0f172a)',
            accent: '#d3f100',
        },
        {
            name: 'Criativo B',
            conv: 54, spend: 198.00, cpa: 3.67, ctr: 2.10,
            adType: 'carousel',
            title: 'Carrossel institucional',
            badge: 'CARROSSEL · 5 CARDS',
            bg: 'linear-gradient(135deg,#4c1d95,#1e1b4b)',
            accent: '#a78bfa',
        },
        {
            name: 'Criativo C',
            conv: 42, spend: 156.75, cpa: 3.73, ctr: 4.10,
            adType: 'image',
            title: 'Depoimento cliente',
            badge: 'IMAGEM · UGC',
            bg: 'linear-gradient(135deg,#14532d,#052e16)',
            accent: '#4ade80',
        },
        {
            name: 'Criativo D',
            conv: 31, spend: 145.20, cpa: 4.68, ctr: 1.90,
            adType: 'video',
            title: 'Vídeo demonstração',
            badge: 'VÍDEO · 30s',
            bg: 'linear-gradient(135deg,#1e40af,#0c1e3f)',
            accent: '#60a5fa',
        },
    ];

    return (
        <div className="mockup-glow" style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
            overflow: 'hidden', maxWidth: 1100, margin: '0 auto',
        }}>
            {/* Browser chrome */}
            <div style={{ background: C.bg, padding: '10px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 5 }}>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#ef4444' }} />
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#f59e0b' }} />
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#22c55e' }} />
                </div>
                <div style={{ flex: 1, background: C.card, padding: '4px 10px', borderRadius: 5, fontSize: 10.5, color: C.textDim }}>
                    🔒 api.alfamaxdigital.com.br/r/pdf/7f242fd39378a645807b038d4fe5071acc36
                </div>
            </div>

            {/* Cover section */}
            <div style={{ background: `linear-gradient(135deg, #0a0e1a, #131a2e, #0a0e1a)`, padding: '28px 24px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -60, right: -60, width: 250, height: 250, background: `radial-gradient(circle, ${C.primaryGlow} 0%, transparent 60%)` }} />
                <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 6, background: `linear-gradient(135deg, ${C.primaryDark}, ${C.primary})`, display: 'grid', placeItems: 'center', fontWeight: 900, color: C.bg, fontSize: 11 }}>A</div>
                        <div style={{ fontSize: 11, fontWeight: 800 }}>Alfamax Digital</div>
                    </div>
                    <div style={{ display: 'inline-block', fontSize: 8.5, letterSpacing: '.15em', textTransform: 'uppercase', padding: '3px 8px', background: C.primaryGlow, color: C.primary, borderRadius: 14, fontWeight: 700, marginBottom: 8 }}>Relatório de Performance</div>
                    <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Cliente Exemplo</h1>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>📅 15 a 21 de julho 2026 · 7 dias · 8 anúncios</div>
                </div>
            </div>

            {/* KPIs grid */}
            <div style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: 9, letterSpacing: '.15em', color: C.textDim, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase' }}>📊 Sumário Executivo · vs período anterior</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
                    {[
                        { label: 'Investimento', val: 'R$ 970,11', delta: '+12.4%', good: true },
                        { label: 'Conversas', val: '256', delta: '+18.2%', good: true },
                        { label: 'Custo/Conv.', val: 'R$ 3,79', delta: '-8.1%', good: true },
                        { label: 'CTR', val: '2.28%', delta: '+3.1%', good: true },
                    ].map((k, i) => (
                        <div key={i} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <div style={{ fontSize: 8.5, color: C.textDim, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{k.label}</div>
                                <div style={{ fontSize: 8, padding: '2px 5px', borderRadius: 8, background: k.good ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)', color: k.good ? '#22c55e' : '#ef4444', fontWeight: 800 }}>
                                    ▲ {k.delta}
                                </div>
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 900, color: C.text }}>{k.val}</div>
                        </div>
                    ))}
                </div>

                {/* Trend chart */}
                <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 20 }}>
                    <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, marginBottom: 8 }}>📈 Investimento diário</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 50 }}>
                        {[65, 45, 78, 52, 88, 40, 95].map((h, i) => (
                            <div key={i} style={{ flex: 1, height: `${h}%`, background: `linear-gradient(to top, ${C.primaryDark}, ${C.primary})`, borderRadius: '2px 2px 0 0' }} />
                        ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 8.5, color: C.textDim }}>
                        <span>15/07</span><span>21/07</span>
                    </div>
                </div>

                {/* Top criativos */}
                <div style={{ fontSize: 9, letterSpacing: '.15em', color: C.textDim, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase' }}>🏆 Ranking de Criativos · 8 anúncios</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
                    {creatives.map((c, i) => (
                        <div key={i} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                            <div style={{ position: 'absolute', top: 5, left: 5, zIndex: 3, background: c.accent, color: C.bg, fontSize: 8, fontWeight: 900, padding: '2px 6px', borderRadius: 4 }}>#{i + 1}</div>
                            {c.adType === 'video' && (
                                <div style={{ position: 'absolute', top: 5, right: 5, zIndex: 3, background: 'rgba(0,0,0,.7)', color: '#fff', fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <Play size={7} fill="#fff" /> 0:15
                                </div>
                            )}
                            {/* Mock ad creative — abstract shapes */}
                            <div style={{
                                aspectRatio: '1/1',
                                background: c.bg,
                                position: 'relative',
                                overflow: 'hidden',
                            }}>
                                {/* Glow accent */}
                                <div style={{
                                    position: 'absolute', top: '-20%', right: '-20%',
                                    width: '120%', height: '120%',
                                    background: `radial-gradient(circle, ${c.accent}25 0%, transparent 60%)`,
                                }} />
                                {/* Formas geométricas abstratas por tipo de criativo */}
                                {c.adType === 'video' && (
                                    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                                        <div style={{
                                            width: 46, height: 46, borderRadius: '50%',
                                            background: `${c.accent}33`, backdropFilter: 'blur(8px)',
                                            display: 'grid', placeItems: 'center',
                                            border: `2px solid ${c.accent}66`,
                                        }}>
                                            <Play size={20} fill={c.accent} color={c.accent} />
                                        </div>
                                    </div>
                                )}
                                {c.adType === 'carousel' && (
                                    <div style={{ position: 'absolute', inset: '20% 15%', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>
                                        {[1, 2, 3].map(n => (
                                            <div key={n} style={{ background: `${c.accent}22`, border: `1px solid ${c.accent}55`, borderRadius: 4 }} />
                                        ))}
                                    </div>
                                )}
                                {c.adType === 'image' && (
                                    <svg style={{ position: 'absolute', left: '15%', top: '20%', width: '70%', height: '50%' }} viewBox="0 0 100 70" fill="none">
                                        <rect x="0" y="0" width="100" height="70" rx="4" stroke={c.accent} strokeWidth="1.5" opacity="0.4" />
                                        <circle cx="25" cy="22" r="6" fill={c.accent} opacity="0.6" />
                                        <path d="M0 70 L30 40 L55 55 L100 25 L100 70 Z" fill={c.accent} opacity="0.35" />
                                        <path d="M0 70 L30 40 L55 55 L100 25" stroke={c.accent} strokeWidth="1.2" opacity="0.7" fill="none" />
                                    </svg>
                                )}
                                {/* Badge topo */}
                                <div style={{ position: 'absolute', top: 8, left: 8, right: 8 }}>
                                    <div style={{ fontSize: 7, color: c.accent, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 2, textShadow: '0 1px 2px rgba(0,0,0,.5)' }}>
                                        {c.badge}
                                    </div>
                                </div>
                                {/* Rótulo bottom */}
                                <div style={{ position: 'absolute', bottom: 6, left: 8, right: 8, textAlign: 'left' }}>
                                    <div style={{ fontSize: 9, color: '#fff', fontWeight: 800, textShadow: '0 1px 3px rgba(0,0,0,.7)', letterSpacing: '-0.02em' }}>
                                        {c.title}
                                    </div>
                                </div>
                            </div>
                            <div style={{ padding: 8 }}>
                                <div style={{ fontSize: 9, fontWeight: 800, color: C.text, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 8.5, color: C.textDim }}>
                                    <div><div style={{ color: C.textDim }}>CONV</div><b style={{ color: C.text }}>{c.conv}</b></div>
                                    <div><div style={{ color: C.textDim }}>INV</div><b style={{ color: C.text }}>R${c.spend.toFixed(0)}</b></div>
                                    <div><div style={{ color: C.textDim }}>CPA</div><b style={{ color: C.text }}>R${c.cpa.toFixed(2)}</b></div>
                                    <div><div style={{ color: C.textDim }}>CTR</div><b style={{ color: C.text }}>{c.ctr}%</b></div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Breakdowns por campanha */}
                <div style={{ fontSize: 9, letterSpacing: '.15em', color: C.textDim, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase' }}>🔍 Detalhamento por Campanha</div>
                <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
                        <div>
                            <div style={{ fontSize: 8.5, color: C.primary, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>CONVERSAS · OUTCOME_ENGAGEMENT</div>
                            <div style={{ fontSize: 12, fontWeight: 800 }}>[CLIENTE][CONVERSAS - MSG][ABO]</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 900, color: C.text }}>R$ 970,11</div>
                            <div style={{ fontSize: 9, color: C.textMuted }}>256 conversas · CTR 2,28%</div>
                        </div>
                    </div>
                    {/* Breakdown mini cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                        <MiniBreakdown title="Plataforma" rows={[{ l: 'Instagram', pct: 82 }, { l: 'Facebook', pct: 15 }, { l: 'WhatsApp', pct: 3 }]} color={C.blue} />
                        <MiniBreakdown title="Posicionamento" rows={[{ l: 'Feed', pct: 45 }, { l: 'Reels IG', pct: 30 }, { l: 'Stories', pct: 25 }]} color={C.primary} />
                        <MiniBreakdown title="Dispositivo" rows={[{ l: 'Android', pct: 65 }, { l: 'iPhone', pct: 32 }, { l: 'Desktop', pct: 3 }]} color={C.purple} />
                        <MiniBreakdown title="Top Regiões" rows={[{ l: 'Ceará', pct: 78 }, { l: 'Piauí', pct: 15 }, { l: 'Outros', pct: 7 }]} color={C.green} />
                    </div>
                </div>
            </div>

            {/* Footer subtle */}
            <div style={{ padding: '10px 24px', borderTop: `1px solid ${C.border}`, fontSize: 9, color: C.textDim, display: 'flex', justifyContent: 'space-between' }}>
                <span>Alfamax Digital · Powered by TrafficAI</span>
                <span>Gerado em 21/07/2026</span>
            </div>
        </div>
    );
}

function MiniBreakdown({ title, rows, color }: { title: string; rows: { l: string; pct: number }[]; color: string }) {
    return (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
            <div style={{ fontSize: 8.5, color: C.textDim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>{title}</div>
            <div style={{ display: 'grid', gap: 6 }}>
                {rows.map((r, i) => (
                    <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 2 }}>
                            <span style={{ color: C.text, fontWeight: 600 }}>{r.l}</span>
                            <span style={{ color: C.textMuted, fontWeight: 700 }}>{r.pct}%</span>
                        </div>
                        <div style={{ height: 3, background: C.bg, borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${r.pct}%`, background: color, borderRadius: 2 }} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── MOCKUP: FULL WHATSAPP ─────────────────────────────────────

function FullWhatsAppMockup() {
    return (
        <div className="mockup-glow" style={{
            background: '#0B141B', border: `2px solid ${C.border}`, borderRadius: 24,
            padding: 10, maxWidth: 420, margin: '0 auto',
        }}>
            {/* Header */}
            <div style={{ background: '#1F2C33', padding: '10px 12px', borderRadius: '18px 18px 0 0', display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, ${C.primaryDark}, ${C.primary})`, display: 'grid', placeItems: 'center', fontWeight: 900, color: C.bg, fontSize: 12 }}>CE</div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#fff', fontWeight: 700 }}>Cliente Exemplo</div>
                    <div style={{ fontSize: 10, color: '#8ba8a3' }}>online</div>
                </div>
                <div style={{ display: 'flex', gap: 12, color: '#8ba8a3' }}>
                    <Video size={16} /><MessageCircle size={16} />
                </div>
            </div>
            {/* Chat */}
            <div style={{ padding: '14px 12px', background: '#0B141B', minHeight: 480 }}>
                <div style={{ background: '#005C4B', color: '#fff', padding: 12, borderRadius: '12px 12px 0 12px', maxWidth: '90%', marginLeft: 'auto', fontSize: 11.5, lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Bom dia RELATÓRIO DIÁRIO — CLIENTE, tudo bem?</div>
                    <div style={{ marginBottom: 8 }}>
                        <b>Resumo de Ontem:</b><br />
                        <span style={{ background: '#0e6c58', padding: '1px 4px', borderRadius: 3, fontSize: 10 }}>[15/07]</span>
                    </div>
                    <div style={{ borderLeft: '3px solid #0e6c58', paddingLeft: 8, marginBottom: 8 }}>
                        💰 Investimento de R$ 148,07<br />
                        ⚡️ Impressões: 11.752<br />
                        📊 Total de <b>25 Conversas</b><br />
                        💰 Custo por Conversa: <b>R$ 5,92</b>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                        <b>Últimos 7 dias:</b><br />
                        <span style={{ background: '#0e6c58', padding: '1px 4px', borderRadius: 3, fontSize: 10 }}>[08/07 a 14/07]</span>
                    </div>
                    <div style={{ borderLeft: '3px solid #0e6c58', paddingLeft: 8, marginBottom: 8 }}>
                        💰 R$ 970,11 · 📊 256 Conversas<br />
                        💰 CPL: R$ 3,79
                    </div>
                    <div style={{ marginTop: 12, padding: 8, background: '#0e6c58', borderRadius: 6 }}>
                        📄 <b>Para ver detalhado por criativo, acesse o link abaixo:</b><br />
                        <span style={{ color: '#7fd0f5', textDecoration: 'underline', fontSize: 10.5 }}>api.alfamaxdigital.com.br/r/pdf/7f242fd39378a645807b038d4fe5071acc36</span>
                    </div>
                    <div style={{ fontSize: 9, color: '#8ba8a3', textAlign: 'right', marginTop: 8 }}>08:00 ✓✓</div>
                </div>
            </div>
        </div>
    );
}

// ─── MOCKUP: TEMPLATES LIBRARY ─────────────────────────────────

function TemplatesLibraryMockup() {
    return (
        <div className="mockup-glow" style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
            overflow: 'hidden', maxWidth: 460, margin: '0 auto',
        }}>
            <div style={{ background: C.bg, padding: '10px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 10, alignItems: 'center' }}>
                <FileText size={13} color={C.primary} />
                <div style={{ fontSize: 11, fontWeight: 700 }}>Templates · WhatsApp · Diário</div>
                <div style={{ marginLeft: 'auto', fontSize: 9, color: C.textDim, padding: '2px 6px', background: C.card, borderRadius: 4 }}>+ Novo</div>
            </div>

            <div style={{ padding: 14, display: 'grid', gap: 8 }}>
                {[
                    { name: 'Formal (padrão)', tag: 'DEFAULT', vars: 12, popular: true },
                    { name: 'Executivo — resumido', tag: 'PRO', vars: 8, popular: false },
                    { name: 'Detalhado com 7d/mês', tag: 'PRO', vars: 15, popular: false },
                    { name: 'WhatsApp Focus (conversas)', tag: 'PRO', vars: 10, popular: false },
                    { name: 'Por criativo — custom', tag: 'CUSTOM', vars: 14, popular: false },
                ].map((t, i) => (
                    <div key={i} style={{
                        background: t.popular ? C.primaryGlow : C.bg,
                        border: `1px solid ${t.popular ? C.primary + '55' : C.border}`,
                        borderRadius: 8, padding: 10,
                        display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                        <div style={{
                            width: 28, height: 28, borderRadius: 6,
                            background: t.popular ? C.primary : C.card, color: t.popular ? C.bg : C.textMuted,
                            display: 'grid', placeItems: 'center',
                        }}>
                            <FileText size={12} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                            <div style={{ fontSize: 9.5, color: C.textDim, marginTop: 2 }}>{t.vars} variáveis</div>
                        </div>
                        <div style={{ fontSize: 8.5, fontWeight: 800, padding: '2px 6px', background: t.popular ? C.primary : C.card, color: t.popular ? C.bg : C.textMuted, borderRadius: 4, letterSpacing: '.05em' }}>{t.tag}</div>
                    </div>
                ))}
            </div>

            {/* Preview */}
            <div style={{ padding: 14, borderTop: `1px solid ${C.border}`, background: C.bg }}>
                <div style={{ fontSize: 9, color: C.textDim, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>Preview em tempo real</div>
                <div style={{ background: C.card, padding: 10, borderRadius: 6, fontSize: 10.5, lineHeight: 1.5, color: C.text, fontFamily: 'monospace' }}>
                    Bom dia <span style={{ color: C.primary }}>{'{client_name}'}</span>!<br />
                    💰 Invest: <span style={{ color: C.primary }}>{'{today_spend}'}</span><br />
                    📊 <span style={{ color: C.primary }}>{'{top_ads_block}'}</span><br />
                    📄 <span style={{ color: C.primary }}>{'{report_link}'}</span>
                </div>
            </div>
        </div>
    );
}

// ─── MOCKUP: APPROVAL FLOW ─────────────────────────────────────

function ApprovalFlow() {
    return (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 32 }}>
            <div className="stack-mobile" style={{
                display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr',
                gap: 20, alignItems: 'center',
            }}>
                {/* Step 1: TrafficAI generates */}
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 14, margin: '0 auto 12px',
                        background: `linear-gradient(135deg, ${C.primaryDark}, ${C.primary})`,
                        display: 'grid', placeItems: 'center',
                        boxShadow: `0 10px 30px ${C.primaryGlow}`,
                    }}>
                        <Bot size={26} color={C.bg} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>1. TrafficAI gera</div>
                    <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4 }}>Cron dispara às 8h, monta texto + link visual</div>
                </div>

                <ArrowRight size={20} color={C.textDim} className="hide-mobile" />

                {/* Step 2: Owner approves */}
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 14, margin: '0 auto 12px',
                        background: '#f59e0b',
                        display: 'grid', placeItems: 'center',
                    }}>
                        <ShieldCheck size={26} color="#fff" />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>2. Você aprova</div>
                    <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4 }}>Recebe no seu zap, revisa, clica "Aprovar" ou edita</div>
                </div>

                <ArrowRight size={20} color={C.textDim} className="hide-mobile" />

                {/* Step 3: Client receives */}
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 14, margin: '0 auto 12px',
                        background: '#22c55e',
                        display: 'grid', placeItems: 'center',
                    }}>
                        <MessageCircle size={26} color="#fff" />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>3. Cliente recebe</div>
                    <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4 }}>Texto + link do relatório visual completo</div>
                </div>
            </div>

            {/* Tag inferior */}
            <div style={{ marginTop: 24, padding: 14, background: C.bg, borderRadius: 10, textAlign: 'center', fontSize: 12, color: C.textMuted }}>
                💡 <b style={{ color: C.text }}>Opcional</b> — pode desativar aprovação e deixar 100% automático quando confiar no template
            </div>
        </div>
    );
}

// ─── ALL FEATURES (categorias em tabs) ────────────────────────

const FEATURE_CATEGORIES = [
    {
        id: 'meta',
        name: 'Meta Ads',
        icon: <Facebook size={16} />,
        color: '#1877F2',
        items: [
            { icon: <UserPlus />, title: 'Meta Embedded Signup', desc: 'Cliente conecta em 1 clique via FB.login SDK. Zero token manual, zero tutorial.' },
            { icon: <Radio />, title: 'Multi-conta automático', desc: 'Sync de todas as contas Meta (BM + owned + client) do seu usuário — sem cadastro manual.' },
            { icon: <Play />, title: 'Meta Actions in-app', desc: 'Pause, ative, mude budget e duplique campanhas direto do painel. Sem abrir Ads Manager.' },
            { icon: <TrendingUp />, title: 'Sync horário automático', desc: 'Insights de campanha, adset e ad atualizados a cada hora sem você fazer nada.' },
            { icon: <Wallet />, title: 'Sync de saldo', desc: 'Saldo Meta atualizado a cada hora + alerta WhatsApp quando cair abaixo do limite configurado.' },
            { icon: <ImageIcon />, title: 'Análise de criativos IA', desc: 'Upload imagem/vídeo/copy. IA identifica padrões vencedores e sugere próximos ads.' },
            { icon: <Star />, title: 'Ranking top criativos', desc: 'Melhores ads por spend/CPA/CTR com thumbnails reais e insights automáticos.' },
            { icon: <Copy />, title: 'Duplicação em 1 clique', desc: 'Cria campanha nova baseada na atual mantendo settings ou variando budget/audience.' },
        ],
    },
    {
        id: 'google',
        name: 'Google Ads',
        icon: <Search size={16} />,
        color: '#4285F4',
        items: [
            { icon: <Building2 />, title: 'MCC (multi-conta)', desc: 'Login-customer-id nativo. Gerencie múltiplos clientes num único login.' },
            { icon: <RefreshCw />, title: 'Sync diário automático', desc: 'Cron 05:00 UTC busca campanhas + insights de todas as contas conectadas.' },
            { icon: <Play />, title: 'Pause/reactivate direto', desc: 'Muda status de campanha Google direto do painel via API.' },
            { icon: <LineChart />, title: 'Insights unificados', desc: 'Meta + Google no mesmo dashboard. CPA, ROAS, cliques comparativos.' },
        ],
    },
    {
        id: 'relatorios',
        name: 'Relatórios',
        icon: <FileText size={16} />,
        color: '#d3f100',
        items: [
            { icon: <MessageCircle />, title: 'WhatsApp diário automático', desc: 'Dispara todo dia no horário configurado com resumo de ontem + top criativos.' },
            { icon: <Calendar />, title: 'Semanal e mensal cron', desc: 'Domingo 9h com resumo dos 7 dias, dia 1 do mês com fechamento mensal.' },
            { icon: <ShieldCheck />, title: 'Workflow de aprovação', desc: 'Dono aprova o relatório antes de mandar pro cliente. Chega de "opa, número errado".' },
            { icon: <Layers />, title: 'Relatório visual com breakdowns', desc: 'HTML dark theme com donut de objetivos, tendência diária, plataforma, posicionamento, idade+gênero, dispositivo, regiões — por campanha.' },
            { icon: <ImageIcon />, title: 'Top criativos com thumbnails', desc: 'Ranking automático com preview real dos ads embutido no relatório.' },
            { icon: <FileText />, title: 'Templates library', desc: 'Biblioteca reutilizável por canal e categoria (Diário/Semanal/Mensal/Alerta) editável.' },
            { icon: <Link2 />, title: 'Snapshot público via link', desc: 'HTML self-contained servido em /r/pdf/:token — cliente abre no celular, imprime em PDF.' },
            { icon: <FileText />, title: 'CSV/texto manual', desc: 'Cliente sem token Meta? Cola CSV ou texto livre e IA extrai as métricas.' },
        ],
    },
    {
        id: 'ia',
        name: 'IA & Análise',
        icon: <Bot size={16} />,
        color: '#8b5cf6',
        items: [
            { icon: <Bot />, title: 'Gestor IA (chat)', desc: 'Chat conversacional com IA que enxerga suas campanhas e responde perguntas contextualizadas.' },
            { icon: <Sparkles />, title: 'Análise de campanha', desc: 'IA lê métricas + histórico e gera análise + recomendações automaticamente.' },
            { icon: <ImageIcon />, title: 'Análise de criativo', desc: 'Upload imagem/vídeo — IA avalia hook, copy, CTA, potencial de fadiga.' },
            { icon: <Star />, title: 'Top Criativos IA', desc: 'IA identifica padrões vencedores entre seus top ads e sugere próximo criativo.' },
            { icon: <LineChart />, title: 'Predições', desc: 'Predição de resultado da campanha baseada em trend histórico + benchmarks.' },
            { icon: <Gauge />, title: 'Créditos IA controlados', desc: 'Cotas mensais por plano. Zero surpresa na conta.' },
        ],
    },
    {
        id: 'automacao',
        name: 'Automação',
        icon: <Zap size={16} />,
        color: '#f59e0b',
        items: [
            { icon: <Zap />, title: 'Regras SE/ENTÃO', desc: 'Se CTR < 1% em 24h → pausa criativo. Se saldo < R$500 → alerta WhatsApp. Editor visual sem código.' },
            { icon: <Clock />, title: 'Cron horário', desc: 'Regras rodam a cada :15min avaliando condições nas suas contas.' },
            { icon: <Bell />, title: 'Alertas customizáveis', desc: 'CPA alto, CTR baixo, gasto acima do esperado, frequência alta — recebe onde quiser.' },
            { icon: <Activity />, title: 'Histórico de eventos', desc: 'Vê tudo que foi disparado pra auditoria e ajuste fino.' },
        ],
    },
    {
        id: 'tracking',
        name: 'Tracking / CAPI',
        icon: <Target size={16} />,
        color: '#22c55e',
        items: [
            { icon: <Target />, title: 'Pixel próprio + CAPI server-side', desc: 'Instala pixel no site do cliente, envia server-side com dedup automático.' },
            { icon: <ShieldCheck />, title: 'Dedup em 5 camadas', desc: 'Event_id, hash, timestamp, source_id, IP — impossível contar mesma venda 2x na Meta.' },
            { icon: <MessageCircle />, title: 'Click-to-WhatsApp', desc: 'Rastreia clique no anúncio → conversa no zap → venda no CRM. Atribuição real de mensagens.' },
            { icon: <Send />, title: 'Purchase from Kommo', desc: 'Lead ganho no Kommo vira Purchase real no Meta automaticamente. Feed pro algoritmo.' },
            { icon: <RefreshCw />, title: 'Retry worker', desc: 'Eventos que falharam são reprocessados a cada 10 min. Zero perda.' },
            { icon: <Activity />, title: 'Health check por source', desc: 'Dashboard mostra eventos 24h, erros, pending retries. Você sabe se tem problema antes do cliente.' },
        ],
    },
    {
        id: 'crm',
        name: 'CRM Comercial',
        icon: <Briefcase size={16} />,
        color: '#ec4899',
        items: [
            { icon: <Plug />, title: 'Sync nativo Kommo', desc: 'Bidirecional: pipelines, leads, conversas, tasks — tudo espelhado.' },
            { icon: <Radio />, title: 'Evolution API (WhatsApp)', desc: 'Recebe mensagens no CRM via webhook Evolution. Multi-instância.' },
            { icon: <Filter />, title: 'Pipelines + estágios', desc: 'Kanban ou tabela. Filtros por vendedor, fonte, valor, período.' },
            { icon: <Target />, title: 'Leads management', desc: 'CRUD completo com atribuição automática, tags, notas, valor previsto.' },
            { icon: <MessageSquare />, title: 'Conversas em tempo real', desc: 'Vê o histórico completo de mensagens do WhatsApp por lead.' },
            { icon: <Users />, title: 'Vendedores + metas', desc: 'Cadastro individual, meta mensal, distribuição automática ou manual.' },
            { icon: <ClipboardList />, title: 'Tarefas comerciais', desc: 'Follow-ups agendados com notificação. Marca completa em 1 clique.' },
            { icon: <Share2 />, title: 'Share-links públicos', desc: 'Cliente vê dashboard comercial dele com senha, sem precisar de login.' },
        ],
    },
    {
        id: 'integracoes',
        name: 'Integrações',
        icon: <Plug size={16} />,
        color: '#38bdf8',
        items: [
            { icon: <Facebook />, title: 'Meta Embedded Signup', desc: 'FB.login SDK — cliente conecta sem tutorial.' },
            { icon: <Search />, title: 'Google Ads MCC', desc: 'OAuth completo + login-customer-id.' },
            { icon: <Cloud />, title: 'Google Drive', desc: 'Upload automático dos PDFs de relatório na pasta do cliente.' },
            { icon: <Calendar />, title: 'Google Calendar', desc: 'Cria reuniões com Meet automático direto do painel.' },
            { icon: <MessageCircle />, title: 'WhatsApp Evolution API', desc: 'Multi-instância para envio de relatórios + tracking CTWA.' },
            { icon: <Instagram />, title: 'Instagram Business', desc: 'Publica posts e responde DMs via IG Business API (em beta).' },
            { icon: <Briefcase />, title: 'Kommo CRM', desc: 'Sync bidirecional completo.' },
        ],
    },
    {
        id: 'operacao',
        name: 'Time & Operação',
        icon: <Users size={16} />,
        color: '#a855f7',
        items: [
            { icon: <Users />, title: 'Multi-usuário', desc: 'Até 7 seats no Elite. Roles admin/member com permissões granulares.' },
            { icon: <KanbanSquare />, title: 'Board Kanban por cliente', desc: 'Trello embutido: colunas customizáveis, drag & drop, checklists, vincula tarefa a campanha Meta ou Google.' },
            { icon: <ClipboardList />, title: 'Agenda de otimizações', desc: 'Fila de tarefas de otimização priorizada com prazo, status e responsável.' },
            { icon: <Calendar />, title: 'Rotina semanal', desc: 'Agenda do gestor mostrando reuniões + demandas do board + tarefas comerciais unificados.' },
            { icon: <Bell />, title: 'Central de alertas', desc: 'Notificações in-app + WhatsApp de tudo que precisa atenção.' },
            { icon: <Palette />, title: 'White-label branded', desc: 'Landing pública por cliente com logo e cores customizados (Elite).' },
        ],
    },
    {
        id: 'financeiro',
        name: 'Financeiro',
        icon: <Wallet size={16} />,
        color: '#14b8a6',
        items: [
            { icon: <FileText />, title: 'Contratos', desc: 'Cadastro de contratos fixos/percentuais/mistos por cliente com valor e vigência.' },
            { icon: <Repeat />, title: 'Cobrança recorrente', desc: 'Billing worker gera fatura mensal automaticamente. Marca overdue quando vence.' },
            { icon: <BarChart3 />, title: 'Dashboard financeiro', desc: 'MRR, receita mensal, cobranças pendentes, overdue — visão consolidada.' },
            { icon: <Tag />, title: 'Categorização', desc: 'Notas por lançamento pra separar por serviço/tipo/mês.' },
        ],
    },
];

function AllFeatures() {
    const [active, setActive] = React.useState('meta');
    const cat = FEATURE_CATEGORIES.find(c => c.id === active)!;

    return (
        <section style={{ padding: '80px 0', borderTop: `1px solid ${C.border}`, background: C.bgSoft }}>
            <div className="container" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                    <div style={{ display: 'inline-block', padding: '5px 14px', background: C.primaryGlow, border: `1px solid ${C.primary}44`, borderRadius: 999, fontSize: 11, color: C.primary, marginBottom: 16, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 800 }}>
                        50+ funcionalidades
                    </div>
                    <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 12 }}>
                        Tudo que você precisa em uma única plataforma
                    </h2>
                    <p style={{ color: C.textMuted, fontSize: 15, maxWidth: 620, margin: '0 auto' }}>
                        Do Meta Ads ao pós-venda no CRM, passando por relatórios, IA, automação e tracking. Explore por categoria.
                    </p>
                </div>

                <div className="stack-mobile" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24 }}>
                    {/* Tabs vertical */}
                    <div style={{ display: 'grid', gap: 6, alignContent: 'start', position: 'sticky', top: 80 }}>
                        {FEATURE_CATEGORIES.map(c => (
                            <button
                                key={c.id}
                                onClick={() => setActive(c.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '12px 16px', borderRadius: 10,
                                    background: active === c.id ? C.card : 'transparent',
                                    border: `1px solid ${active === c.id ? C.primary + '55' : 'transparent'}`,
                                    color: active === c.id ? C.text : C.textMuted,
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    fontSize: 13.5, fontWeight: active === c.id ? 800 : 600,
                                    transition: 'all .15s',
                                    fontFamily: 'inherit',
                                }}
                                onMouseEnter={e => {
                                    if (active !== c.id) (e.currentTarget as HTMLElement).style.background = C.card;
                                }}
                                onMouseLeave={e => {
                                    if (active !== c.id) (e.currentTarget as HTMLElement).style.background = 'transparent';
                                }}
                            >
                                <span style={{
                                    width: 30, height: 30, borderRadius: 7,
                                    background: c.color + '22', color: c.color,
                                    display: 'grid', placeItems: 'center', flexShrink: 0,
                                }}>{c.icon}</span>
                                <span style={{ flex: 1 }}>{c.name}</span>
                                <span style={{ fontSize: 11, color: C.textDim, fontWeight: 700 }}>{c.items.length}</span>
                            </button>
                        ))}
                    </div>

                    {/* Grid de features */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                            <span style={{ width: 40, height: 40, borderRadius: 10, background: cat.color + '22', color: cat.color, display: 'grid', placeItems: 'center' }}>{cat.icon}</span>
                            <div>
                                <h3 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{cat.name}</h3>
                                <div style={{ fontSize: 12, color: C.textDim }}>{cat.items.length} funcionalidades</div>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                            {cat.items.map((it, i) => (
                                <div key={i} className="feat-item" style={{
                                    background: C.card, border: `1px solid ${C.border}`,
                                    borderRadius: 10, padding: 16, transition: 'all .15s',
                                }}>
                                    <div style={{
                                        width: 32, height: 32, borderRadius: 8,
                                        background: cat.color + '18', color: cat.color,
                                        display: 'grid', placeItems: 'center', marginBottom: 10,
                                    }}>{it.icon}</div>
                                    <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 4, color: C.text }}>{it.title}</div>
                                    <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>{it.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

function ReplacesTools() {
    // 8 ferramentas típicas do dia-a-dia de agências brasileiras
    const tools = [
        { name: 'Meta Ads',       color: '#1877F2' },
        { name: 'Google Ads',     color: '#FBBC04' },
        { name: 'WhatsApp',       color: '#25D366' },
        { name: 'Kommo',          color: '#8B5CF6' },
        { name: 'Trello',         color: '#0079BF' },
        { name: 'Looker Studio',  color: '#EA4335' },
        { name: 'Google Sheets',  color: '#0F9D58' },
        { name: 'Zapier',         color: '#FF4A00' },
    ];

    // Coords no viewBox (0 0 1000 380) — preserveAspectRatio="none" faz esticar
    // Grid 4x2, cards ~239px, centers em x: 120 / 373 / 627 / 880
    const CX = [120, 373, 627, 880];
    // Row 1 bottom em y=70, Row 2 bottom em y=170 (com gap de 14)
    const R1 = 70;
    const R2 = 170;
    const EX = 500;  // centro horizontal (topo do pill TrafficAI)
    const EY = 290;  // topo do pill

    return (
        <section style={{ padding: '90px 0 100px', borderTop: `1px solid ${C.border}` }}>
            <div className="container" style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', background: C.primaryGlow, border: `1px solid ${C.primary}55`, borderRadius: 999, fontSize: 11, color: C.primary, marginBottom: 18, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 800 }}>
                    <Layers size={11} /> Tudo em um só lugar
                </div>
                <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 16 }}>
                    Substitua várias ferramentas <span style={{ color: C.primary }}>por uma só</span>.
                </h2>
                <p style={{ fontSize: 15.5, color: C.textMuted, maxWidth: 640, margin: '0 auto', lineHeight: 1.6 }}>
                    Pare de pagar por 5+ sistemas que não conversam entre si. O TrafficAI concentra ads, CRM, financeiro, tracking e relatórios em uma única plataforma.
                </p>

                {/* Diagrama */}
                <div className="replaces-diagram" style={{ position: 'relative', marginTop: 60, minHeight: 340 }}>
                    {/* SVG de linhas convergentes (fica atrás dos cards) */}
                    <svg
                        aria-hidden="true"
                        viewBox="0 0 1000 380"
                        preserveAspectRatio="none"
                        style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            pointerEvents: 'none',
                            overflow: 'visible',
                            zIndex: 0,
                        }}
                    >
                        {tools.map((t, i) => {
                            const row = i < 4 ? 0 : 1;
                            const col = i % 4;
                            const sx = CX[col];
                            const sy = row === 0 ? R1 : R2;
                            // Bezier — a linha cai reto, depois curva pro centro
                            const d = `M ${sx} ${sy} Q ${sx} ${(sy + EY) / 2 + 30} ${EX} ${EY}`;
                            return (
                                <path
                                    key={i}
                                    d={d}
                                    stroke={t.color}
                                    strokeWidth="1.4"
                                    strokeDasharray="5 5"
                                    fill="none"
                                    opacity="0.55"
                                />
                            );
                        })}
                    </svg>

                    {/* Grid de cards */}
                    <div className="replaces-grid" style={{
                        position: 'relative',
                        zIndex: 1,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: 14,
                        marginBottom: 100,
                    }}>
                        {tools.map(t => (
                            <div key={t.name} style={{
                                padding: '18px 14px',
                                background: `linear-gradient(135deg, ${t.color}12, ${t.color}05)`,
                                border: `1px solid ${t.color}33`,
                                borderRadius: 12,
                                fontWeight: 700,
                                fontSize: 14,
                                color: t.color,
                                position: 'relative',
                                overflow: 'hidden',
                            }}>
                                {/* Blur glow no canto */}
                                <div style={{
                                    position: 'absolute', top: -30, right: -30,
                                    width: 80, height: 80, borderRadius: '50%',
                                    background: t.color, opacity: 0.14, filter: 'blur(24px)',
                                }} />
                                <span style={{
                                    position: 'relative',
                                    textDecoration: 'line-through',
                                    textDecorationColor: `${t.color}80`,
                                    textDecorationThickness: 2,
                                }}>{t.name}</span>
                            </div>
                        ))}
                    </div>

                    {/* Pill central: TrafficAI */}
                    <div style={{
                        position: 'relative',
                        zIndex: 2,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '14px 22px',
                        background: '#0f172a',
                        border: `1px solid ${C.primary}66`,
                        borderRadius: 14,
                        boxShadow: `0 15px 50px ${C.primaryGlow}, 0 0 0 4px rgba(211,241,0,.05)`,
                    }}>
                        <div style={{
                            width: 34, height: 34, borderRadius: 9,
                            background: `linear-gradient(135deg, ${C.primaryDark}, ${C.primary})`,
                            display: 'grid', placeItems: 'center',
                            color: C.bg, fontWeight: 900, fontSize: 15,
                        }}>T</div>
                        <div style={{ textAlign: 'left' }}>
                            <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>TrafficAI</div>
                            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>Operação completa em um só lugar</div>
                        </div>
                    </div>
                </div>

                {/* Sub-features (grid pequeno reforçando o "tudo") */}
                <div style={{
                    marginTop: 44,
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 10, maxWidth: 900, marginLeft: 'auto', marginRight: 'auto',
                }}>
                    {[
                        { icon: Activity,    label: 'Tracking + CAPI' },
                        { icon: MessageCircle, label: 'WhatsApp automations' },
                        { icon: Wallet,      label: 'Financeiro + MRR' },
                        { icon: KanbanSquare, label: 'Board de demandas' },
                        { icon: Users,       label: 'CRM + comercial' },
                        { icon: FileText,    label: 'Relatórios visuais' },
                    ].map((f, i) => (
                        <div key={i} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '8px 12px',
                            background: C.card, border: `1px solid ${C.border}`,
                            borderRadius: 999, fontSize: 12, color: C.textMuted,
                        }}>
                            <f.icon size={12} color={C.primary} />
                            {f.label}
                        </div>
                    ))}
                </div>
            </div>

            <style>{`
                @media (max-width: 720px) {
                    .replaces-grid { grid-template-columns: repeat(2, 1fr) !important; }
                    .replaces-diagram svg { display: none !important; }
                }
            `}</style>
        </section>
    );
}

// ─── TESTIMONIALS ──────────────────────────────────────────────

function Testimonials() {
    return (
        <section id="depoimentos" style={{ padding: '80px 0', borderTop: `1px solid ${C.border}` }}>
            <div className="container" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
                <div style={{ textAlign: 'center', marginBottom: 48 }}>
                    <div style={{ fontSize: 11, color: C.primary, letterSpacing: '.15em', textTransform: 'uppercase', fontWeight: 800, marginBottom: 10 }}>Casos reais</div>
                    <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                        Quem escala conta, time e relatório <br />sem perder o fio da meada.
                    </h2>
                </div>
                <div className="stack-mobile" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                    {[
                        {
                            quote: 'Reduzi o tempo de fechamento de relatório de 4h por semana pra zero. Sério.',
                            author: 'Rafael Braga',
                            role: 'RB Tráfego',
                            avatar: 'RB',
                        },
                        {
                            quote: 'A automação de saldo já salvou 3 clientes de ficarem sem grana no meio da semana.',
                            author: 'Isabela Torres',
                            role: 'Torres Marketing',
                            avatar: 'IT',
                        },
                        {
                            quote: 'A gente ganhou 6 clientes esse ano só de mostrar o dashboard antes de fechar o contrato.',
                            author: 'Marcos Andrade',
                            role: 'MP Agência',
                            avatar: 'MA',
                        },
                        {
                            quote: 'O relatório visual mudou completamente a minha percepção do cliente. Renovaram 100%.',
                            author: 'Camila Souza',
                            role: 'CS Ads',
                            avatar: 'CS',
                        },
                    ].map((t, i) => (
                        <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
                            <div style={{ display: 'flex', gap: 3, marginBottom: 12 }}>
                                {[1, 2, 3, 4, 5].map(n => <Star key={n} size={12} fill={C.primary} color={C.primary} />)}
                            </div>
                            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: C.text, marginBottom: 20 }}>"{t.quote}"</p>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <div style={{
                                    width: 34, height: 34, borderRadius: '50%',
                                    background: `linear-gradient(135deg, ${C.primaryDark}, ${C.primary})`,
                                    display: 'grid', placeItems: 'center', fontWeight: 900, color: C.bg, fontSize: 12,
                                }}>{t.avatar}</div>
                                <div>
                                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t.author}</div>
                                    <div style={{ fontSize: 11, color: C.textDim }}>{t.role}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

// ─── PARA QUEM É ───────────────────────────────────────────────

function ForWho() {
    return (
        <section style={{ padding: '80px 0', borderTop: `1px solid ${C.border}` }}>
            <div className="container" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
                <div style={{ textAlign: 'center', marginBottom: 48 }}>
                    <div style={{ fontSize: 11, color: C.primary, letterSpacing: '.15em', textTransform: 'uppercase', fontWeight: 800, marginBottom: 10 }}>Feito pra você</div>
                    <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 800, letterSpacing: '-0.02em' }}>Para que é recomendado?</h2>
                </div>
                <div className="stack-mobile" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                    {[
                        { icon: <Zap />, title: 'Gestores de tráfego', desc: 'Que gerenciam de 5 a 30 contas e precisam automatizar relatório e monitoramento.' },
                        { icon: <Building2 />, title: 'Agências', desc: 'Time de 3-10 pessoas com necessidade de padronizar operação e mostrar valor pro cliente.' },
                        { icon: <Users />, title: 'Operadores de campanhas', desc: 'Freela que quer dobrar carteira sem dobrar horas trabalhadas.' },
                        { icon: <Layers />, title: 'Quem tem várias contas', desc: 'Consultor com clientes espalhados que precisa de visão unificada + comunicação profissional.' },
                    ].map((p, i) => (
                        <div key={i} className="feat-item" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 22, transition: 'border-color .2s' }}>
                            <div style={{ width: 40, height: 40, borderRadius: 8, background: C.primaryGlow, color: C.primary, display: 'grid', placeItems: 'center', marginBottom: 12 }}>{p.icon}</div>
                            <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>{p.title}</h3>
                            <p style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.55, margin: 0 }}>{p.desc}</p>
                        </div>
                    ))}
                </div>
                <div style={{ marginTop: 32, background: C.card, border: `1px solid ${C.primary}44`, borderRadius: 12, padding: 24, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Se você tem uma agência, o TrafficAI resolve.</div>
                        <div style={{ fontSize: 13, color: C.textMuted }}>Testa 7 dias sem cartão e cancela quando quiser.</div>
                    </div>
                    <Link href="/" className="btn-primary" style={{
                        padding: '12px 24px', background: C.primary, color: C.bg,
                        borderRadius: 8, textDecoration: 'none', fontWeight: 800, fontSize: 14,
                    }}>Testar agora →</Link>
                </div>
            </div>
        </section>
    );
}

// ─── PRICING ───────────────────────────────────────────────────

function Pricing() {
    const plans = [
        {
            name: 'Starter', slug: 'starter',
            price: 101, oldPrice: 127,
            clients: 5, ai: 50, seats: 1,
            features: [
                'Dashboard multi-conta Meta',
                '50 créditos IA/mês',
                'Relatórios WhatsApp diários',
                'Alerta de saldo Meta',
                '1 usuário',
                'Suporte por chat',
            ],
        },
        {
            name: 'Pro', slug: 'pro',
            price: 197, oldPrice: 247,
            clients: 20, ai: 300, seats: 3,
            popular: true,
            features: [
                'Tudo do Starter',
                'Análise IA de criativos',
                'Automação SE/ENTÃO',
                'CAPI + Kommo integrados',
                'Meta Actions no painel',
                'Ranking automático de criativos',
                '3 usuários',
            ],
        },
        {
            name: 'Agency', slug: 'agency',
            price: 317, oldPrice: 397,
            clients: 50, ai: 600, seats: 5,
            features: [
                'Tudo do Pro',
                'Google Ads MCC',
                'Google Drive + Agenda',
                'CRM Comercial + Kommo sync',
                'Aprovação de relatórios (workflow)',
                'Board Kanban por cliente',
                'Compartilhamento de dashboards',
                '5 usuários',
            ],
        },
        {
            name: 'Elite', slug: 'elite',
            price: 437, oldPrice: 547,
            clients: 100, ai: 1200, seats: 7,
            features: [
                'Tudo do Agency',
                'Templates library completa',
                'Landing pública branded por cliente',
                'API dedicada',
                'Onboarding VIP (1:1)',
                'Suporte prioritário',
                '7 usuários',
            ],
        },
    ];

    return (
        <section id="planos" style={{ padding: '80px 0', borderTop: `1px solid ${C.border}` }}>
            <div className="container" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                    <div style={{ display: 'inline-block', padding: '4px 12px', background: 'rgba(34,197,94,.15)', color: C.green, borderRadius: 12, fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 800, marginBottom: 12 }}>
                        20% mais barato que AdsDaily
                    </div>
                    <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 8 }}>
                        Escolha seu plano e comece em minutos
                    </h2>
                    <p style={{ color: C.textMuted, fontSize: 15 }}>7 dias grátis em todos os planos. Cancele quando quiser.</p>
                </div>

                <div className="stack-mobile" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                    {plans.map(p => <PlanCard key={p.slug} {...p} />)}
                </div>

                <p style={{ textAlign: 'center', color: C.textDim, marginTop: 32, fontSize: 13 }}>
                    Precisa de mais que 100 clientes ou white-label?{' '}
                    <a href="mailto:contato@alfamaxdigital.com.br" style={{ color: C.primary, textDecoration: 'none', fontWeight: 700 }}>Fale com a gente</a>
                </p>
            </div>
        </section>
    );
}

function PlanCard({ name, slug, price, oldPrice, clients, ai, seats, features, popular }: any) {
    return (
        <div className={popular ? 'plan-popular' : ''} style={{
            padding: 26,
            background: popular ? `linear-gradient(180deg, ${C.primaryGlow}, transparent)` : C.card,
            borderRadius: 14,
            border: `1px solid ${popular ? C.primary : C.border}`,
            position: 'relative',
        }}>
            {popular && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: C.primary, color: C.bg, fontSize: 10.5, fontWeight: 900, padding: '4px 12px', borderRadius: 999, letterSpacing: '.1em' }}>
                    MAIS POPULAR
                </div>
            )}
            <div style={{ fontSize: 13, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, fontWeight: 800 }}>{name}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.03em', color: C.text }}>
                    R$ {price}
                    <span style={{ fontSize: 13, color: C.textDim, fontWeight: 500, marginLeft: 4 }}>/mês</span>
                </div>
            </div>
            {oldPrice && (
                <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
                    <span style={{ textDecoration: 'line-through' }}>AdsDaily R$ {oldPrice}</span>
                    <span style={{ color: C.green, marginLeft: 6, fontWeight: 700 }}>economize R$ {oldPrice - price}</span>
                </div>
            )}
            <div style={{ display: 'grid', gap: 4, margin: '18px 0 20px', padding: 12, background: 'rgba(255,255,255,.02)', borderRadius: 8, fontSize: 12 }}>
                <div style={{ color: C.textMuted }}>👥 <b style={{ color: C.text }}>{clients}</b> clientes</div>
                <div style={{ color: C.textMuted }}>🤖 <b style={{ color: C.text }}>{ai}</b> créditos IA/mês</div>
                <div style={{ color: C.textMuted }}>👤 <b style={{ color: C.text }}>{seats}</b> usuários</div>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'grid', gap: 8 }}>
                {features.map((f: string, i: number) => (
                    <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5 }}>
                        <Check size={14} color={popular ? C.primary : C.green} style={{ flexShrink: 0, marginTop: 2 }} />
                        <span style={{ color: C.text }}>{f}</span>
                    </li>
                ))}
            </ul>
            <Link href={`/?plan=${slug}`} className="btn-primary" style={{
                display: 'block', textAlign: 'center', padding: '12px',
                background: popular ? C.primary : 'transparent',
                border: popular ? 'none' : `1px solid ${C.border}`,
                color: popular ? C.bg : C.text,
                borderRadius: 10, textDecoration: 'none', fontWeight: 800, fontSize: 13.5,
            }}>Selecionar {name}</Link>
        </div>
    );
}

// ─── FAQ ───────────────────────────────────────────────────────

function FAQ() {
    const items = [
        {
            q: 'A Ads Daily não é a mesma ferramenta?',
            a: 'Não. A gente cobra 20% menos, entrega +14 features exclusivas (CRM comercial, Drive+Agenda, Meta Embedded Signup, Board Kanban, Landing branded, Aprovação de relatórios etc.) e o painel foi construído pra quem tem 20+ clientes escalando.',
        },
        {
            q: 'Posso criar campanhas dentro do TrafficAI?',
            a: 'Sim — pausa, ativa, muda budget e duplica campanhas direto do painel. Criação completa (novos criativos) ainda passa pelo Meta Ads Manager, mas você não precisa mais abrir ele pra operação do dia-a-dia.',
        },
        {
            q: 'Consigo gerenciar várias contas?',
            a: 'Sim. Meta Ads e Google Ads (via MCC) numa única tela. Todos os planos permitem multi-conta — o limite é só quantos "clientes" cabem no seu plano (Starter 5, Pro 20, Agency 50, Elite 100).',
        },
        {
            q: 'Os relatórios são automatizados?',
            a: 'Totalmente. Diário no horário que você escolher, semanal (dia da semana escolhido), mensal (dia do mês). Envio via WhatsApp com texto + link do relatório visual completo. Ainda pode ter aprovação prévia por você antes de disparar pro cliente (workflow).',
        },
        {
            q: 'Consigo acompanhar vendas em tempo real?',
            a: 'Sim, com o CAPI + Click-to-WhatsApp. Rastreio end-to-end: clique no anúncio → conversa no zap → lead no Kommo → venda ganha vira Purchase real no Meta. Dedupe em 5 camadas pra nunca contar a mesma venda 2 vezes.',
        },
        {
            q: 'A plataforma é indicada para agências?',
            a: 'Foi construída pra agências. Multi-user (até 7 seats no Elite), permissões, workflow de aprovação, CRM comercial completo, share-links pra cliente ver dashboard sem login, e landing branded personalizada.',
        },
    ];
    return (
        <section id="faq" style={{ padding: '80px 0', borderTop: `1px solid ${C.border}` }}>
            <div className="container" style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px' }}>
                <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 800, textAlign: 'center', marginBottom: 32, letterSpacing: '-0.02em' }}>
                    Perguntas frequentes
                </h2>
                <div style={{ display: 'grid', gap: 8 }}>
                    {items.map((it, i) => (
                        <details key={i} className="faq-item" style={{
                            background: C.card, border: `1px solid ${C.border}`,
                            borderRadius: 10, padding: 0, overflow: 'hidden',
                        }}>
                            <summary style={{
                                padding: '18px 22px', cursor: 'pointer',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                fontSize: 14.5, fontWeight: 600, listStyle: 'none',
                            }}>
                                <span>{it.q}</span>
                                <ChevronDown size={18} color={C.textMuted} style={{ transition: 'transform .2s', flexShrink: 0 }} />
                            </summary>
                            <div style={{ padding: '0 22px 20px', fontSize: 13.5, color: C.textMuted, lineHeight: 1.6 }}>
                                {it.a}
                            </div>
                        </details>
                    ))}
                </div>
            </div>
        </section>
    );
}

// ─── FINAL CTA ─────────────────────────────────────────────────

function FinalCTA() {
    return (
        <section style={{ padding: '80px 0', background: `linear-gradient(180deg, transparent, ${C.primaryGlow})`, borderTop: `1px solid ${C.border}` }}>
            <div className="container" style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
                <h2 style={{ fontSize: 'clamp(30px, 4.5vw, 44px)', fontWeight: 900, marginBottom: 16, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                    7 dias para validar<br />com suas contas reais
                </h2>
                <p style={{ color: C.textMuted, marginBottom: 32, fontSize: 16, maxWidth: 560, margin: '0 auto 32px' }}>
                    Conecte suas contas Meta e Google, dispare os primeiros relatórios e veja se o TrafficAI resolve pra você. Sem cartão. Sem risco.
                </p>
                <Link href="/" className="btn-primary" style={{
                    padding: '18px 40px', background: C.primary, color: C.bg,
                    borderRadius: 12, textDecoration: 'none', fontWeight: 900,
                    fontSize: 16, boxShadow: `0 12px 40px ${C.primaryGlow}`,
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                }}>
                    Começar agora <ArrowRight size={18} />
                </Link>
                <div style={{ marginTop: 20, fontSize: 12, color: C.textDim }}>
                    ✓ Setup em 5 min · ✓ Sem cartão · ✓ Cancela a qualquer momento
                </div>
            </div>
        </section>
    );
}

// ─── FOOTER ────────────────────────────────────────────────────

function Footer() {
    return (
        <footer style={{ borderTop: `1px solid ${C.border}`, padding: '48px 0 32px', background: C.bgSoft }}>
            <div className="container" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
                <div className="stack-mobile" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: 40, marginBottom: 32 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${C.primaryDark}, ${C.primary})`, display: 'grid', placeItems: 'center', fontWeight: 900, color: C.bg, fontSize: 13 }}>T</div>
                            <span style={{ fontWeight: 900, fontSize: 16 }}>TrafficAI</span>
                        </div>
                        <p style={{ fontSize: 12.5, color: C.textDim, lineHeight: 1.6, marginBottom: 12 }}>
                            A operação de mídia paga que não depende de você. Feito pela Alfamax Digital pra gestores que querem escalar sem virar operacional.
                        </p>
                    </div>
                    <FooterCol title="Produto" links={[
                        { name: 'Funcionalidades', href: '#features' },
                        { name: 'Planos', href: '#planos' },
                        { name: 'FAQ', href: '#faq' },
                    ]} />
                    <FooterCol title="Empresa" links={[
                        { name: 'Alfamax', href: 'https://alfamaxdigital.com.br' },
                        { name: 'Contato', href: 'mailto:contato@alfamaxdigital.com.br' },
                    ]} />
                    <FooterCol title="Legal" links={[
                        { name: 'Termos de uso', href: '#' },
                        { name: 'Política de privacidade', href: '#' },
                    ]} />
                </div>
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, textAlign: 'center', fontSize: 12, color: C.textDim }}>
                    © 2026 TrafficAI · Feito pela <a href="https://alfamaxdigital.com.br" style={{ color: C.primary, textDecoration: 'none' }}>Alfamax Digital</a> 💚
                </div>
            </div>
        </footer>
    );
}

function FooterCol({ title, links }: { title: string; links: { name: string; href: string }[] }) {
    return (
        <div>
            <div style={{ fontSize: 12, color: C.text, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800, marginBottom: 12 }}>{title}</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                {links.map((l, i) => (
                    <li key={i}>
                        <a href={l.href} style={{ color: C.textMuted, textDecoration: 'none', fontSize: 13, transition: 'color .2s' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = C.primary}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = C.textMuted}>
                            {l.name}
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    );
}
