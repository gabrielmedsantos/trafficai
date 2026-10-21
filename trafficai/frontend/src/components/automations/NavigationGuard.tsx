"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
type Guard = (href: string) => boolean;
type Navigation = {
  register: (guard: Guard) => () => void;
  navigate: (href: string) => void;
};
const NavigationContext = createContext<Navigation | null>(null);
export function useAutomationNavigation() {
  const context = useContext(NavigationContext);
  if (!context) throw Error("Automation navigation provider missing");
  return context;
}
export default function NavigationGuard({ children }: { children: ReactNode }) {
  const router = useRouter(),
    guard = useRef<Guard | null>(null);
  const register = useCallback((next: Guard) => {
    guard.current = next;
    return () => {
      if (guard.current === next) guard.current = null;
    };
  }, []);
  const navigate = useCallback(
    (href: string) => {
      if (!guard.current || guard.current(href)) router.push(href);
    },
    [router],
  );
  const context = useMemo(() => ({ register, navigate }), [register, navigate]);
  return (
    <NavigationContext.Provider value={context}>
      <div
        style={{ display: "contents" }}
        onClickCapture={(event) => {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
            "a[href]",
          );
          if (
            !link ||
            link.target === "_blank" ||
            link.hasAttribute("download")
          )
            return;
          const url = new URL(link.href, location.href);
          if (
            url.origin !== location.origin ||
            url.pathname + url.search === location.pathname + location.search
          )
            return;
          if (
            guard.current &&
            !guard.current(url.pathname + url.search + url.hash)
          ) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {children}
      </div>
    </NavigationContext.Provider>
  );
}
