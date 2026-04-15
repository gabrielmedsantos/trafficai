'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Zap, Mail, Lock, User, ArrowRight } from 'lucide-react';

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
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--gradient-hero)',
      padding: '20px',
    }}>
      {/* Background decorations */}
      <div style={{
        position: 'fixed',
        top: '-20%',
        right: '-10%',
        width: '600px',
        height: '600px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed',
        bottom: '-20%',
        left: '-10%',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div className="fade-in" style={{ maxWidth: '420px', width: '100%' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: 'var(--gradient-primary)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            boxShadow: '0 0 40px rgba(59,130,246,0.3)',
          }}>
            <Zap size={32} color="white" />
          </div>
          <h1 style={{
            fontSize: '32px',
            fontWeight: 800,
            background: 'var(--gradient-primary)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '8px',
          }}>
            TrafficAI
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>
            Inteligência artificial para suas campanhas de tráfego
          </p>
        </div>

        {/* Card */}
        <div className="card-glass" style={{ padding: '32px' }}>
          {/* Tabs */}
          <div style={{
            display: 'flex',
            gap: '4px',
            padding: '4px',
            background: 'var(--bg-input)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '28px',
          }}>
            <button
              onClick={() => setIsLogin(true)}
              style={{
                flex: 1,
                padding: '10px',
                border: 'none',
                borderRadius: '6px',
                fontFamily: 'inherit',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'var(--transition)',
                background: isLogin ? 'var(--gradient-primary)' : 'transparent',
                color: isLogin ? 'white' : 'var(--text-muted)',
              }}
            >
              Entrar
            </button>
            <button
              onClick={() => setIsLogin(false)}
              style={{
                flex: 1,
                padding: '10px',
                border: 'none',
                borderRadius: '6px',
                fontFamily: 'inherit',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'var(--transition)',
                background: !isLogin ? 'var(--gradient-primary)' : 'transparent',
                color: !isLogin ? 'white' : 'var(--text-muted)',
              }}
            >
              Cadastrar
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {!isLogin && (
              <div className="form-group">
                <label className="form-label">Nome</label>
                <div style={{ position: 'relative' }}>
                  <User size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Seu nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ paddingLeft: '42px', width: '100%' }}
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="email"
                  className="form-input"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{ paddingLeft: '42px', width: '100%' }}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Senha</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="password"
                  className="form-input"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  style={{ paddingLeft: '42px', width: '100%' }}
                />
              </div>
            </div>

            {error && (
              <div style={{
                padding: '12px 16px',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--accent-red)',
                fontSize: '13px',
                marginBottom: '16px',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '14px',
                fontSize: '15px',
                marginTop: '8px',
              }}
            >
              {loading ? (
                <div className="spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }} />
              ) : (
                <>
                  {isLogin ? 'Entrar' : 'Criar conta'}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
          Ao continuar, você concorda com os Termos de Uso e Política de Privacidade.
        </p>
      </div>
    </div>
  );
}
