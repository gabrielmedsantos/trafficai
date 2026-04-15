import Sidebar from '@/components/Sidebar';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                {children}
            </main>
        </div>
    );
}
