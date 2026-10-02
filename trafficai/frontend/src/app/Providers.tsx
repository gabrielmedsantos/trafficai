'use client';

import { AccountProvider } from './AccountContext';
import { UserProvider } from './UserContext';
import ImpersonationBanner from '@/components/ImpersonationBanner';

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <UserProvider>
            <ImpersonationBanner />
            <AccountProvider>
                {children}
            </AccountProvider>
        </UserProvider>
    );
}
