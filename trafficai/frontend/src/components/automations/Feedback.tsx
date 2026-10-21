"use client";
import Link from "next/link";
import { AlertCircle, RefreshCw, LockKeyhole } from "lucide-react";
export function ErrorFeedback({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  const unauthorized = /authentication token|expired token|unauthorized/i.test(
    message,
  );
  return (
    <div className="aw-notice aw-error aw-feedback" role="alert">
      {unauthorized ? <LockKeyhole size={19} /> : <AlertCircle size={19} />}
      <div>
        <strong>
          {unauthorized
            ? "Entre para acessar suas automações"
            : "Não foi possível concluir"}
        </strong>
        <p>
          {unauthorized
            ? "Seus fluxos e contatos ficam protegidos pela sua conta."
            : message}
        </p>
        <div className="aw-row">
          {unauthorized ? (
            <Link
              className="aw-link"
              href="/"
              onClick={() => {
                try {
                  sessionStorage.setItem(
                    "__tai_after_login__",
                    location.pathname + location.search,
                  );
                } catch {}
              }}
            >
              Entrar na minha conta
            </Link>
          ) : (
            retry && (
              <button onClick={retry}>
                <RefreshCw size={14} />
                Tentar novamente
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
export function LoadingState({
  label = "Carregando seus dados…",
}: {
  label?: string;
}) {
  return (
    <div className="aw-loading" role="status" aria-live="polite">
      <RefreshCw size={20} className="aw-spin" />
      <span>{label}</span>
      <div className="aw-skeleton" />
      <div className="aw-skeleton short" />
    </div>
  );
}
