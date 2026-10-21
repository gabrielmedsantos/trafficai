"use client";
import { useEffect, useRef, type ReactNode } from "react";
export default function ModalFrame({
  children,
  onClose,
  busy = false,
}: {
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null),
    latest = useRef({ onClose, busy });
  useEffect(() => {
    latest.current = { onClose, busy };
  }, [onClose, busy]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        root.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ) || [],
      ).filter((e) => e.getClientRects().length > 0);
    (
      root.current?.querySelector<HTMLElement>("[autofocus]") ||
      focusable()[0] ||
      root.current
    )?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !latest.current.busy) {
        event.preventDefault();
        event.stopPropagation();
        latest.current.onClose();
      }
      if (event.key === "Tab") {
        const items = focusable(),
          first = items[0],
          last = items[items.length - 1];
        if (!first) {
          event.preventDefault();
          root.current?.focus();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !root.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !root.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle, true);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handle, true);
      previous?.focus();
    };
  }, []);
  return (
    <div ref={root} className="aw-modal" tabIndex={-1}>
      {children}
    </div>
  );
}
