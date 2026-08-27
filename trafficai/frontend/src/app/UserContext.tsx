'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { api } from '@/lib/api';

interface CurrentUser {
    id: string;
    name?: string;
    email: string;
    role: 'admin' | 'member';
    capabilities?: string[] | null;
}

interface UserContextType {
    user: CurrentUser | null;
    loading: boolean;
    // true quando o usuário pode usar essa funcionalidade — admin sempre pode;
    // membro sem `capabilities` (null) também pode (default sem restrição).
    can: (capability: string) => boolean;
    refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchUser = useCallback(async () => {
        const token = localStorage.getItem('trafficai_token');
        if (!token) {
            setLoading(false);
            return;
        }
        try {
            const data = await api.getMe();
            setUser(data);
        } catch (error) {
            console.error('Failed to load current user:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchUser(); }, [fetchUser]);

    const can = useCallback((capability: string) => {
        if (!user) return true; // ainda carregando — não bloqueia otimisticamente
        if (user.role === 'admin') return true;
        if (user.capabilities == null) return true;
        return user.capabilities.includes(capability);
    }, [user]);

    return (
        <UserContext.Provider value={{ user, loading, can, refreshUser: fetchUser }}>
            {children}
        </UserContext.Provider>
    );
}

export function useCurrentUser() {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error('useCurrentUser must be used within a UserProvider');
    }
    return context;
}
