"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Activity,
  BarChart3,
  Boxes,
  GitBranch,
  LayoutDashboard,
  Mail,
  Megaphone,
  Radio,
  Users,
  FileText,
  Contact,
} from "lucide-react";
import { useAutomationNavigation } from "./NavigationGuard";
const sections = [
  {
    id: "overview",
    name: "Visão geral",
    icon: LayoutDashboard,
    href: "/automacoes",
  },
  {
    id: "flows",
    name: "Fluxos",
    icon: GitBranch,
    href: "/automacoes?tab=flows",
  },
  {
    id: "campaigns",
    name: "Campanhas",
    icon: Megaphone,
    href: "/automacoes/campanhas",
  },
  {
    id: "segments",
    name: "Audiência",
    icon: Users,
    href: "/automacoes/audiencia",
  },
  {
    id: "email",
    name: "Funil de e-mail",
    icon: Mail,
    href: "/automacoes/email",
  },
  {
    id: "products",
    name: "Produtos",
    icon: Boxes,
    href: "/automacoes?tab=products",
  },
  {
    id: "templates",
    name: "Modelos",
    icon: FileText,
    href: "/automacoes?tab=templates",
  },
  {
    id: "contacts",
    name: "Contatos",
    icon: Contact,
    href: "/automacoes?tab=contacts",
  },
  {
    id: "runs",
    name: "Execuções",
    icon: Activity,
    href: "/automacoes?tab=runs",
  },
  {
    id: "integrations",
    name: "Canais",
    icon: Radio,
    href: "/automacoes?tab=integrations",
  },
  {
    id: "analytics",
    name: "Analytics",
    icon: BarChart3,
    href: "/automacoes/analytics",
  },
];
export default function AutomationNavigation() {
  const path = usePathname(),
    params = useSearchParams(),
    { navigate } = useAutomationNavigation();
  const active = path.startsWith("/automacoes/fluxos/")
    ? "flows"
    : path === "/automacoes"
      ? params.get("tab") || "overview"
      : (
          {
            "/automacoes/audiencia": "segments",
            "/automacoes/campanhas": "campaigns",
            "/automacoes/email": "email",
            "/automacoes/analytics": "analytics",
          } as Record<string, string>
        )[path] || "overview";
  return (
    <div className="aw-module-nav">
      <div className="aw-breadcrumb">
        <span className="aw-module-mark">
          <GitBranch size={15} />
        </span>
        <Link href="/automacoes">Automações</Link>
        <span>/</span>
        <span>{sections.find((s) => s.id === active)?.name}</span>
      </div>
      <nav
        className="aw-nav aw-nav-desktop"
        aria-label="Navegação de automações"
      >
        {sections.map(({ id, name, href, icon: Icon }) => (
          <Link
            key={id}
            className={active === id ? "selected" : ""}
            aria-current={active === id ? "page" : undefined}
            href={href}
          >
            <Icon size={15} />
            {name}
          </Link>
        ))}
      </nav>
      <label className="aw-nav-mobile">
        Navegar nas automações
        <select
          value={sections.find((s) => s.id === active)?.href}
          onChange={(e) => navigate(e.target.value)}
        >
          {sections.map((s) => (
            <option key={s.id} value={s.href}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
