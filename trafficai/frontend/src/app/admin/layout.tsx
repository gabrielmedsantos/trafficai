import Sidebar from '@/components/Sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return <div className="app-layout"><Sidebar /><main className="main-content" style={{ minWidth: 0 }}>{children}</main></div>;
}
