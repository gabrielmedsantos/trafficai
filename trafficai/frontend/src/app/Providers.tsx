'use client';

import { AccountProvider } from './AccountContext';
import { UserProvider } from './UserContext';
import ImpersonationBanner from '@/components/ImpersonationBanner';
import TableResizer from '@/components/TableResizer';

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <UserProvider>
            <ImpersonationBanner />
            <TableResizer />
            <AccountProvider>
                {children}
            </AccountProvider>
        </UserProvider>
    );
}
