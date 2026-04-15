'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, X, Building2 } from 'lucide-react';

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
    placeholder = 'Selecionar conta…',
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
        <div ref={ref} style={{ position: 'relative', width: '100%' }}>
            {/* Trigger */}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'var(--bg-input)',
                    border: `1px solid ${open ? 'var(--border-focus)' : 'var(--border)'}`,
                    borderRadius: '8px',
                    padding: '9px 12px',
                    color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: '13.5px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    transition: 'border-color .15s',
                    boxShadow: open ? '0 0 0 3px rgba(99,102,241,.1)' : 'none',
                }}
            >
                {selected && (
                    <Building2 size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {displayLabel}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    {value && !allowAll && (
                        <span
                            role="button"
                            onClick={e => { e.stopPropagation(); onChange(''); }}
                            style={{ color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1, padding: '2px', borderRadius: '4px' }}
                        >
                            <X size={12} />
                        </span>
                    )}
                    <ChevronDown size={14} color="var(--text-muted)"
                        style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                </div>
            </button>

            {/* Dropdown */}
            {open && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 5px)',
                    left: 0, right: 0,
                    zIndex: 1000,
                    background: '#141928',
                    border: '1px solid var(--border-light)',
                    borderRadius: '10px',
                    boxShadow: '0 12px 40px rgba(0,0,0,.55)',
                    overflow: 'hidden',
                    animation: 'scaleIn 0.15s ease-out',
                    transformOrigin: 'top',
                }}>
                    {/* Search */}
                    <div style={{ padding: '8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Search size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                        <input
                            ref={inputRef}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar conta…"
                            style={{
                                flex: 1, background: 'none', border: 'none', outline: 'none',
                                color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'inherit',
                            }}
                        />
                        {search && (
                            <button onClick={() => setSearch('')}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    {/* Options */}
                    <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                        {allowAll && (
                            <button onClick={() => select('')} style={optionStyle(!value)}>
                                <span style={{ opacity: 0.6, marginRight: '6px', fontSize: '12px' }}>◈</span>
                                {allLabel}
                            </button>
                        )}

                        {filtered.length === 0 ? (
                            <div style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
                                Nenhuma conta encontrada
                            </div>
                        ) : (
                            filtered.map(a => (
                                <button key={a.id} onClick={() => select(a.id)} style={optionStyle(a.id === value)}>
                                    <Building2 size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {a.account_name}
                                    </span>
                                    {a.id === value && (
                                        <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--primary)', fontWeight: 700 }}>✓</span>
                                    )}
                                </button>
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    {accounts.length > 0 && (
                        <div style={{ padding: '5px 12px', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>
                            {filtered.length}/{accounts.length} contas
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function optionStyle(active: boolean): React.CSSProperties {
    return {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        padding: '9px 12px',
        textAlign: 'left',
        background: active ? 'rgba(99,102,241,.14)' : 'transparent',
        color: active ? '#a5b4fc' : '#cbd5e1',
        border: 'none',
        borderBottom: '1px solid rgba(255,255,255,.025)',
        cursor: 'pointer',
        fontSize: '13px',
        fontFamily: 'inherit',
        transition: 'background .1s',
    };
}
