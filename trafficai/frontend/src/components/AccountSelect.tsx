'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, X, Check } from 'lucide-react';

interface Account {
    id: string;
    account_name: string;
}

interface Props {
    accounts: Account[];
    value: string;
    onChange: (id: string) => void;
    placeholder?: string;
    allowAll?: boolean;
    allLabel?: string;
}

export default function AccountSelect({
    accounts, value, onChange,
    placeholder = 'Selecionar conta',
    allowAll = false,
    allLabel = 'Todas as contas',
}: Props) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selected = accounts.find(a => a.id === value);
    const filtered = accounts.filter(a =>
        a.account_name.toLowerCase().includes(search.toLowerCase())
    );

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
                setSearch('');
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    useEffect(() => {
        if (open && inputRef.current) inputRef.current.focus();
    }, [open]);

    const select = (id: string) => { onChange(id); setOpen(false); setSearch(''); };

    const displayLabel = selected
        ? selected.account_name
        : (allowAll ? allLabel : placeholder);

    return (
        <div ref={ref} className="account-select">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="account-select-trigger"
                aria-expanded={open}
            >
                <span className="truncate" style={{ flex: 1, color: selected ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {displayLabel}
                </span>
                {value && !allowAll && (
                    <span
                        role="button"
                        onClick={e => { e.stopPropagation(); onChange(''); }}
                        style={{ color: 'var(--text-muted)', display: 'flex', padding: 2 }}
                    >
                        <X size={12} />
                    </span>
                )}
                <ChevronDown
                    size={14}
                    color="var(--text-muted)"
                    style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--duration) var(--ease)', flexShrink: 0 }}
                />
            </button>

            {open && (
                <div className="account-select-dropdown">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                        <Search size={13} color="var(--text-muted)" />
                        <input
                            ref={inputRef}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar"
                            style={{
                                flex: 1,
                                background: 'none',
                                border: 'none',
                                outline: 'none',
                                color: 'var(--text-primary)',
                                fontSize: 13,
                                fontFamily: 'inherit',
                            }}
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                style={{ color: 'var(--text-muted)', display: 'flex', padding: 2 }}
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    {allowAll && (
                        <button
                            type="button"
                            onClick={() => select('')}
                            className={`account-select-option ${!value ? 'active' : ''}`}
                        >
                            <span className="truncate" style={{ flex: 1 }}>{allLabel}</span>
                            {!value && <Check size={13} />}
                        </button>
                    )}

                    {filtered.length === 0 ? (
                        <div style={{ padding: '14px 10px', fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center' }}>
                            Nenhuma conta encontrada
                        </div>
                    ) : (
                        filtered.map(a => (
                            <button
                                key={a.id}
                                type="button"
                                onClick={() => select(a.id)}
                                className={`account-select-option ${a.id === value ? 'active' : ''}`}
                            >
                                <span className="truncate" style={{ flex: 1 }}>{a.account_name}</span>
                                {a.id === value && <Check size={13} />}
                            </button>
                        ))
                    )}

                    {accounts.length > 0 && (
                        <div style={{ padding: '6px 10px 2px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                            {filtered.length} de {accounts.length}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
