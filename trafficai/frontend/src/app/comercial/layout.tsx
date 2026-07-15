import Sidebar from '@/components/Sidebar';

// Força todas as rotas /comercial/* a serem dinâmicas (sem cache HIT do Next)
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function ComercialLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                {children}
            </main>
        </div>
    );
}
