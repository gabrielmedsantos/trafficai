import { Suspense } from "react";
import AutomationNavigation from "@/components/automations/AutomationNavigation";
import NavigationGuard from "@/components/automations/NavigationGuard";
import Sidebar from "@/components/Sidebar";
import "./automations.css";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <NavigationGuard>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content aw-main">
          <div className="aw">
            <Suspense fallback={<div className="aw-nav-placeholder" />}>
              <AutomationNavigation />
            </Suspense>
            {children}
          </div>
        </main>
      </div>
    </NavigationGuard>
  );
}
