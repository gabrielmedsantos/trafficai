'use client';

import { AccountProvider } from './AccountContext';

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <AccountProvider>
            {children}
        </AccountProvider>
    );
}
