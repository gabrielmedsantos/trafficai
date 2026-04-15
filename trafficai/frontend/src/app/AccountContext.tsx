'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '@/lib/api';

export interface AdAccount {
    id: string;
    meta_account_id: string;
    account_name: string;
    currency: string;
}

interface AccountContextType {
    accounts: AdAccount[];
    selectedAccountId: string | null;
    setSelectedAccountId: (id: string | null) => void;
    loading: boolean;
    refreshAccounts: () => Promise<void>;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export function AccountProvider({ children }: { children: ReactNode }) {
    const [accounts, setAccounts] = useState<AdAccount[]>([]);
    const [selectedAccountId, setSelectedAccountIdState] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchAccounts = async () => {
        // Só busca contas se houver um token de autenticação
        const token = localStorage.getItem('trafficai_token');
        if (!token) {
            setLoading(false);
            return;
        }

        try {
            const data = await api.getActiveAccounts();
            setAccounts(data);

            // Load selected account from storage or default to null
            const stored = localStorage.getItem('trafficai_selected_account');
            if (stored && data.some(a => a.id === stored)) {
                setSelectedAccountIdState(stored);
            }
        } catch (error) {
            console.error('Failed to load accounts:', error);
            // Se erro 401, limpa o token inválido
            if (error instanceof Error && error.message.includes('Invalid or expired token')) {
                localStorage.removeItem('trafficai_token');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAccounts();
    }, []);

    const setSelectedAccountId = (id: string | null) => {
        setSelectedAccountIdState(id);
        if (id) {
            localStorage.setItem('trafficai_selected_account', id);
        } else {
            localStorage.removeItem('trafficai_selected_account');
        }
    };

    return (
        <AccountContext.Provider value={{
            accounts,
            selectedAccountId,
            setSelectedAccountId,
            loading,
            refreshAccounts: fetchAccounts
        }}>
            {children}
        </AccountContext.Provider>
    );
}

export function useAccount() {
    const context = useContext(AccountContext);
    if (context === undefined) {
        throw new Error('useAccount must be used within an AccountProvider');
    }
    return context;
}
