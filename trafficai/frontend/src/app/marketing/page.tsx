'use client';

import Link from 'next/link';
import { Sparkles, Bot, TrendingUp, Zap, ShieldCheck, Check, MessageSquare, BarChart3 } from 'lucide-react';

export default function MarketingPage() {
    return (
        <div style={{ background: '#0d0e10', color: '#e8eaee', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>

            {/* NAV */}
            <nav style={{ padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 1200, margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg,#ff6b35,#a855f7)', display: 'grid', placeItems: 'center', fontWeight: 900, color: '#0d0e10' }}>T</div>
                    <span style={{ fontWeight: 800, fontSize: 18 }}>TrafficAI</span>
                </div>
                <Link href="/" style={{ color: '#ff6b35', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>Entrar →</Link>
            </nav>

            {/* HERO */}
            <section style={{ padding: '80px 32px', textAlign: 'center', maxWidth: 900, margin: '0 auto' }}>
                <div style={{ display: 'inline-block', padding: '6px 14px', background: 'rgba(255,107,53,.1)', border: '1px solid rgba(255,107,53,.3)', borderRadius: 999, fontSize: 12, color: '#ff6b35', marginBottom: 24, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700 }}>
                    Para gestores de tráfego que gerenciam mais de 5 clientes
                </div>
                <h1 style={{ fontSize: 'clamp(36px, 5vw, 64px)', fontWeight: 900, lineHeight: 1.05, margin: '0 0 24px', letterSpacing: '-0.03em' }}>
                    A operação de mídia paga <br />
                    <span style={{ background: 'linear-gradient(135deg,#ff6b35,#a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>que não depende de você.</span>
                </h1>
                <p style={{ fontSize: 20, color: '#a0a3a8', maxWidth: 660, margin: '0 auto 40px', lineHeight: 1.5 }}>
                    Relatórios diários no WhatsApp do cliente, análise de criativos por IA, automação de status,
                    rastreio CAPI com Kommo. Tudo integrado. Zero planilha.
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Link href="/" style={{ padding: '14px 32px', background: '#ff6b35', color: '#0d0e10', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>
                        Começar grátis (7 dias)
                    </Link>
                    <a href="#pricing" style={{ padding: '14px 32px', border: '1px solid rgba(255,255,255,.15)', color: '#e8eaee', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 15 }}>
                        Ver planos
                    </a>
                </div>
                <div style={{ marginTop: 32, fontSize: 13, color: '#6b6e73' }}>
                    Sem cartão · cancelamento na hora · atribuição CAPI já pronta
                </div>
            </section>

            {/* FEATURES */}
            <section style={{ padding: '64px 32px', maxWidth: 1100, margin: '0 auto' }}>
                <h2 style={{ fontSize: 32, fontWeight: 800, textAlign: 'center', marginBottom: 8 }}>
                    O que outras plataformas fazem, mas <span style={{ color: '#ff6b35' }}>a gente faz melhor</span>
                </h2>
                <p style={{ textAlign: 'center', color: '#a0a3a8', marginBottom: 48, fontSize: 15 }}>
                    Trafficai é a única com atribuição CAPI end-to-end, integração Kommo nativa e IA que analisa criativos automaticamente.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                    <Feat icon={<Bot />} title="IA analisa seus top criativos" desc="Identifica padrões vencedores e sugere próximos ads. Sem colar copy manual." />
                    <Feat icon={<MessageSquare />} title="Relatório WhatsApp automático" desc="4 templates prontos. Cliente recebe todo dia. Você não faz nada." />
                    <Feat icon={<Zap />} title="Automação SE/ENTÃO" desc="Pausa campanha ruim automaticamente. Reativa a boa. Dorme tranquilo." />
                    <Feat icon={<TrendingUp />} title="Alerta de saldo baixo" desc="Saldo caiu abaixo do limite? WhatsApp na hora. Nada de campanha pausada por descuido." />
                    <Feat icon={<BarChart3 />} title="CAPI + Kommo integrados" desc="Rastreio de venda ganha no CRM vira Purchase real no Meta. Atribuição correta." />
                    <Feat icon={<ShieldCheck />} title="Sem duplicatas, sem inflar métrica" desc="Dedup em 5 camadas. Nunca conta a mesma venda 2 vezes na Meta." />
                </div>
            </section>

            {/* PRICING */}
            <section id="pricing" style={{ padding: '64px 32px', maxWidth: 1100, margin: '0 auto' }}>
                <h2 style={{ fontSize: 32, fontWeight: 800, textAlign: 'center', marginBottom: 8 }}>Planos</h2>
                <p style={{ textAlign: 'center', color: '#a0a3a8', marginBottom: 48 }}>Comece grátis. Escale quando quiser.</p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                    <Plan name="Starter" price="97" clients="5" ai="100" seats="1" features={['Relatórios WhatsApp diários', 'Análise IA de criativos', 'Alerta de saldo', '1 usuário']} />
                    <Plan name="Pro" price="197" clients="15" ai="300" seats="3" popular features={['Tudo Starter', 'Automação SE/ENTÃO', 'CAPI + Kommo', 'Top Criativos IA', '3 usuários']} />
                    <Plan name="Agency" price="397" clients="40" ai="800" seats="7" features={['Tudo Pro', 'Escrita direto no Meta', 'Google Ads integrado', 'Templates customizáveis', '7 usuários']} />
                    <Plan name="Elite" price="797" clients="∞" ai="2000" seats="15" features={['Tudo Agency', 'API dedicada', 'Onboarding VIP', 'Suporte prioritário', 'Usuários ilimitados']} />
                </div>
            </section>

            {/* CTA FINAL */}
            <section style={{ padding: '80px 32px', textAlign: 'center', background: 'linear-gradient(180deg, transparent, rgba(255,107,53,.05))' }}>
                <h2 style={{ fontSize: 36, fontWeight: 800, marginBottom: 12 }}>Pronto pra recuperar suas manhãs?</h2>
                <p style={{ color: '#a0a3a8', marginBottom: 32 }}>7 dias grátis. Sem cartão. Cancelamento a qualquer momento.</p>
                <Link href="/" style={{ padding: '16px 40px', background: '#ff6b35', color: '#0d0e10', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 16 }}>
                    Começar agora
                </Link>
            </section>

            <footer style={{ padding: '32px', borderTop: '1px solid rgba(255,255,255,.08)', textAlign: 'center', color: '#6b6e73', fontSize: 13 }}>
                © 2026 TrafficAI · Feito pela Alfamax Digital · Feito para gestores de tráfego 🧡
            </footer>
        </div>
    );
}

function Feat({ icon, title, desc }: any) {
    return (
        <div style={{ padding: 24, background: '#16181b', borderRadius: 12, border: '1px solid rgba(255,255,255,.06)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(255,107,53,.12)', display: 'grid', placeItems: 'center', color: '#ff6b35', marginBottom: 16 }}>{icon}</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{title}</h3>
            <p style={{ color: '#a0a3a8', fontSize: 14, lineHeight: 1.5, margin: 0 }}>{desc}</p>
        </div>
    );
}

function Plan({ name, price, clients, ai, seats, features, popular }: any) {
    return (
        <div style={{
            padding: 28,
            background: popular ? 'linear-gradient(180deg, rgba(255,107,53,.08), transparent)' : '#16181b',
            borderRadius: 12,
            border: `1px solid ${popular ? 'rgba(255,107,53,.4)' : 'rgba(255,255,255,.06)'}`,
            position: 'relative',
        }}>
            {popular && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#ff6b35', color: '#0d0e10', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 999, letterSpacing: '.08em' }}>MAIS POPULAR</div>}
            <div style={{ fontSize: 13, color: '#a0a3a8', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, fontWeight: 700 }}>{name}</div>
            <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.02em' }}>R${price}<span style={{ fontSize: 15, color: '#6b6e73', fontWeight: 500 }}>/mês</span></div>
            <div style={{ fontSize: 13, color: '#a0a3a8', margin: '12px 0 20px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>👥 {clients} clientes</span>
                <span>🤖 {ai} créditos IA</span>
                <span>👤 {seats} usuários</span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', fontSize: 13.5 }}>
                {features.map((f: string, i: number) => (
                    <li key={i} style={{ padding: '6px 0', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <Check size={16} color="#22c55e" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span style={{ color: '#e8eaee' }}>{f}</span>
                    </li>
                ))}
            </ul>
            <Link href="/" style={{
                display: 'block',
                textAlign: 'center',
                padding: '12px',
                background: popular ? '#ff6b35' : 'transparent',
                border: popular ? 'none' : '1px solid rgba(255,255,255,.15)',
                color: popular ? '#0d0e10' : '#e8eaee',
                borderRadius: 8,
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: 14,
            }}>Começar</Link>
        </div>
    );
}
