import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Dashboard Comercial',
    robots: { index: false, follow: false },
};

export default function PublicDashboardLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
