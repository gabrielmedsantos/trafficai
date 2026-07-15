'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Zap, ArrowRight } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const result = isLogin
                ? await api.login(email, password)
                : await api.register(email, password, name);

            localStorage.setItem('trafficai_token', result.token);
            router.push('/dashboard');
        } catch (err: any) {
            setError(err.message || 'Erro ao processar. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            background: 'var(--bg-base)',
        }}>
            {/* Painel lateral de marca — escondido em telas pequenas */}
            <aside className="auth-panel">
                <div className="auth-panel-inner">
                    <div className="auth-panel-brand">
                        <div className="sidebar-brand-mark" style={{ width: 40, height: 40, borderRadius: 10 }}>
                            <Zap size={20} strokeWidth={2.4} />
                        </div>
                        <div className="sidebar-brand-name">
                            <span className="brand" style={{ fontSize: 16 }}>Alfamax</span>
                            <span className="product">TrafficAI</span>
                        </div>
                    </div>

                    <div style={{ marginTop: 80 }}>
                        <h2 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.5px', lineHeight: 1.25, color: 'var(--text-primary)', marginBottom: 16, maxWidth: 420 }}>
                            Inteligência completa para quem vive de tráfego pago.
                        </h2>
                        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65, maxWidth: 420 }}>
                            Uma plataforma desenhada para agências sérias. Alertas inteligentes,
                            relatórios automáticos com IA e dados do Meta Ads exatos &mdash; sem
                            discrepância com o Gerenciador.
                        </p>
                    </div>

                    <div style={{ marginTop: 56, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                        <AuthFeature
                            title="Dados exatos"
                            desc="Sincronização paginada com o Meta. Bate 1:1 com o Gerenciador de Anúncios."
                        />
                        <AuthFeature
                            title="Alertas que importam"
                            desc="Notificações críticas no WhatsApp. Análise 1×/dia, sem spam."
                        />
                        <AuthFeature
                            title="Relatórios prontos"
                            desc="PDF e link público mensal para cada cliente, com IA narrando."
                        />
                        <AuthFeature
                            title="Multi-conta"
                            desc="Gerencie todas as contas do Business Manager em um só lugar."
                        />
                    </div>

                    <p style={{ marginTop: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                        © {new Date().getFullYear()} Alfamax Digital · Todos os direitos reservados
                    </p>
                </div>
            </aside>

            {/* Painel do formulário */}
            <main style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 24px',
            }}>
                <div className="fade-in" style={{ width: '100%', maxWidth: 380 }}>
                    <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.3px', color: 'var(--text-primary)', marginBottom: 6 }}>
                        {isLogin ? 'Entrar na sua conta' : 'Criar sua conta'}
                    </h1>
                    <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 28 }}>
                        {isLogin
                            ? 'Acesse sua dashboard e continue de onde parou.'
                            : 'Comece agora — leva menos de um minuto.'}
                    </p>

                    <form onSubmit={handleSubmit}>
                        {!isLogin && (
                            <div className="form-group">
                                <label className="form-label" htmlFor="name">Nome</label>
                                <input
                                    id="name"
                                    type="text"
                                    className="form-input"
                                    placeholder="Como podemos te chamar"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required={!isLogin}
                                />
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label" htmlFor="email">Email</label>
                            <input
                                id="email"
                                type="email"
                                className="form-input"
                                placeholder="voce@empresa.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label" htmlFor="password">Senha</label>
                            <input
                                id="password"
                                type="password"
                                className="form-input"
                                placeholder="Mínimo 8 caracteres"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={8}
                                autoComplete={isLogin ? 'current-password' : 'new-password'}
                            />
                        </div>

                        {error && (
                            <div style={{
                                padding: '10px 12px',
                                background: 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.22)',
                                borderRadius: 'var(--radius-sm)',
                                color: '#fca5a5',
                                fontSize: 12.5,
                                marginBottom: 16,
                            }}>
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={loading}
                            style={{ width: '100%', height: 40, fontSize: 14, marginTop: 4 }}
                        >
                            {loading ? (
                                <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                            ) : (
                                <>
                                    {isLogin ? 'Entrar' : 'Criar conta'}
                                    <ArrowRight size={15} strokeWidth={2.2} />
                                </>
                            )}
                        </button>
                    </form>

                    <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                        {isLogin ? 'Ainda não tem conta?' : 'Já tem conta?'}{' '}
                        <button
                            type="button"
                            onClick={() => setIsLogin(!isLogin)}
                            style={{ color: 'var(--primary)', fontWeight: 500 }}
                        >
                            {isLogin ? 'Cadastrar' : 'Entrar'}
                        </button>
                    </div>

                    <p style={{ marginTop: 32, textAlign: 'center', fontSize: 11.5, color: 'var(--text-subtle)' }}>
                        Ao continuar, você concorda com os Termos de Uso e Política de Privacidade.
                    </p>
                </div>
            </main>

            <style jsx>{`
                .auth-panel {
                    background: linear-gradient(180deg, #0d1221 0%, var(--bg-base) 100%);
                    border-right: 1px solid var(--border);
                    display: flex;
                    padding: 48px;
                    position: relative;
                    overflow: hidden;
                }
                .auth-panel::before {
                    content: '';
                    position: absolute;
                    top: -150px;
                    right: -150px;
                    width: 400px;
                    height: 400px;
                    background: radial-gradient(circle, rgba(255, 107, 53,0.09), transparent 70%);
                    pointer-events: none;
                }
                .auth-panel-inner {
                    position: relative;
                    z-index: 1;
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    max-width: 460px;
                }
                .auth-panel-brand {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                @media (max-width: 960px) {
                    .auth-panel { display: none; }
                }
            `}</style>
        </div>
    );
}

function AuthFeature({ title, desc }: { title: string; desc: string }) {
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--primary)' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>{desc}</p>
        </div>
    );
}
