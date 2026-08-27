'use client';

import { AccountProvider } from './AccountContext';
import { UserProvider } from './UserContext';

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <UserProvider>
            <AccountProvider>
                {children}
            </AccountProvider>
        </UserProvider>
    );
}
