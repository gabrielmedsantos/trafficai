import Sidebar from '@/components/Sidebar';

export default function AgentLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
                {children}
            </main>
        </div>
    );
}
