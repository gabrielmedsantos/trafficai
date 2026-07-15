'use client';

import { useEffect, useState, useRef } from 'react';
import { Building2, ChevronDown, Check, Plus, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import styles from './ClientPicker.module.css';

interface Client {
    id: string;
    name: string;
    company: string | null;
    avatar_color: string | null;
}

interface Props {
    value: string;
    onChange: (clientId: string) => void;
    /** Permitir selecionar "Todos os clientes" (default true) */
    allowAll?: boolean;
    /** Tornar obrigatório selecionar um cliente (esconde "Todos") */
    required?: boolean;
    placeholder?: string;
}

const COLORS = ['#ff6b35', '#8b5cf6', '#ec4899', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];

export default function ClientPicker({ value, onChange, allowAll = true, required = false, placeholder = 'Todos os clientes' }: Props) {
    const [clients, setClients] = useState<Client[]>([]);
    const [open, setOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState(COLORS[0]!);
    const [submitting, setSubmitting] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const load = () => {
        api.getClientsList()
            .then(rows => setClients((rows || []).map((c: any) => ({
                id: c.id,
                name: c.name,
                company: c.company,
                avatar_color: c.avatar_color || '#ff6b35',
            }))))
            .catch(() => {});
    };

    useEffect(load, []);

    useEffect(() => {
        // Usa mousedown (não click) pra detectar antes do React re-renderizar.
        // Click só fecharia ANTES do React rodar o onClick interno se o target já tivesse sumido do DOM.
        const onMouseDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
                setCreating(false);
            }
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, []);

    const selected = clients.find(c => c.id === value);

    const handleCreate = async () => {
        if (!newName.trim()) return;
        setSubmitting(true);
        try {
            const created = await api.createClientQuick({ name: newName.trim(), avatar_color: newColor });
            // Adiciona à lista e seleciona
            setClients(prev => [...prev, {
                id: created.id, name: created.name,
                company: created.company, avatar_color: created.avatar_color,
            }]);
            onChange(created.id);
            setNewName('');
            setCreating(false);
            setOpen(false);
        } catch (err: any) {
            alert('Erro ao criar cliente: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const onCreateKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            handleCreate();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setCreating(false);
            setNewName('');
        }
    };

    return (
        <div ref={ref} className={styles.wrap}>
            <button onClick={() => setOpen(o => !o)} className={styles.trigger} type="button">
                {selected ? (
                    <>
                        <span className={styles.dot} style={{ background: selected.avatar_color || '#ff6b35' }} />
                        <span className={styles.label}>{selected.name}</span>
                    </>
                ) : (
                    <>
                        <Building2 size={12} className={styles.icon} />
                        <span className={styles.label}>{placeholder}</span>
                    </>
                )}
                <ChevronDown size={12} className={styles.chev} />
            </button>

            {open && (
                <div className={styles.dropdown}>
                    {allowAll && !required && (
                        <button
                            type="button"
                            onClick={() => { onChange(''); setOpen(false); }}
                            className={`${styles.option} ${value === '' ? styles.optionActive : ''}`}
                        >
                            <span className={styles.optionDot} style={{ background: 'var(--text-muted)' }} />
                            <span className={styles.optionLabel}>{placeholder}</span>
                            {value === '' && <Check size={12} />}
                        </button>
                    )}

                    {clients.map(c => (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => { onChange(c.id); setOpen(false); }}
                            className={`${styles.option} ${value === c.id ? styles.optionActive : ''}`}
                        >
                            <span className={styles.optionDot} style={{ background: c.avatar_color || '#ff6b35' }} />
                            <span className={styles.optionLabel}>
                                {c.name}
                                {c.company && <span className={styles.optionSub}>{c.company}</span>}
                            </span>
                            {value === c.id && <Check size={12} />}
                        </button>
                    ))}

                    {clients.length === 0 && !creating && (
                        <div className={styles.empty}>Nenhum cliente cadastrado</div>
                    )}

                    {/* Divisor + criação inline */}
                    <div className={styles.divider} />

                    {creating ? (
                        <div className={styles.createForm}>
                            <div className={styles.createRow}>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    onKeyDown={onCreateKey}
                                    placeholder="Nome do cliente (Enter pra criar)"
                                    autoFocus
                                    className={styles.createInput}
                                />
                            </div>
                            <div className={styles.colorRow}>
                                {COLORS.map(c => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setNewColor(c)}
                                        className={`${styles.colorDot} ${newColor === c ? styles.colorDotActive : ''}`}
                                        style={{ background: c }}
                                        aria-label={`Cor ${c}`}
                                    />
                                ))}
                            </div>
                            <div className={styles.createActions}>
                                <button type="button" onClick={() => { setCreating(false); setNewName(''); }} className={styles.btnGhost}>
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCreate}
                                    disabled={submitting || !newName.trim()}
                                    className={styles.btnPrimaryMini}
                                >
                                    {submitting ? <Loader2 size={11} className={styles.spin} /> : <Plus size={11} />}
                                    Criar
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setCreating(true)}
                            className={styles.createBtn}
                        >
                            <Plus size={12} />
                            <span>Cadastrar novo cliente</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
