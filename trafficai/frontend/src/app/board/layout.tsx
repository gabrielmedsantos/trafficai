import Sidebar from '@/components/Sidebar';

export default function BoardLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                {children}
            </main>
        </div>
    );
}
