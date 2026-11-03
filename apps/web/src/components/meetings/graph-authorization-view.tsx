import Link from "next/link";
import styles from "./graph-authorization.module.css";
import { GraphAuthorizationIllustration } from "./graph-authorization-illustration";
import type { GraphAuthorizationViewState } from "./graph-authorization-state";

type Props = {
  state: GraphAuthorizationViewState;
  statusMessage: string | null;
  isChecking?: boolean;
  onCheckAgain: () => void;
};

function BrandMark() {
  return (
    <div className={styles.brand} aria-label="NITE Connect">
      <svg className={styles.brandIcon} viewBox="0 0 54 42" aria-hidden="true">
        <path d="M5 34 17 8c1.2-2.6 4.8-2.8 6.2-.3l8.1 14.2 9-16.2c1.4-2.5 5.1-2.3 6.2.4l3.8 9.3-12.1 22.1c-1.3 2.4-4.8 2.4-6.2.1l-8.4-14.7-8.1 14.7c-1.3 2.4-4.8 2.6-6.3.3L5 34Z" fill="url(#brandBlue)" />
        <defs><linearGradient id="brandBlue" x1="8" y1="34" x2="45" y2="4" gradientUnits="userSpaceOnUse"><stop stopColor="#0877ff" /><stop offset="1" stopColor="#25a7ff" /></linearGradient></defs>
      </svg>
      <span className={styles.brandDivider} aria-hidden="true" />
      <span className={styles.brandName}><strong>NITE</strong> Connect</span>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.buttonIcon}>
      <rect x="3.5" y="5" width="17" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.5 3v4M16.5 3v4M4 9.5h16" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${styles.buttonIcon} ${spinning ? styles.spinning : ""}`}>
      <path d="M20 7v5h-5M4.7 9A7.5 7.5 0 0 1 18 6.5L20 9M4 17v-5h5m10.3 3A7.5 7.5 0 0 1 6 17.5L4 15" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function statusHeading(state: GraphAuthorizationViewState): string {
  switch (state) {
    case "checking": return "Verificando autorização do Microsoft 365";
    case "consent-required": return "A conexão com o Microsoft 365 ainda não foi autorizada";
    default: return "Não foi possível confirmar a conexão com o Microsoft 365";
  }
}

function statusDescription(state: GraphAuthorizationViewState): string {
  if (state === "consent-required") {
    return "A criação e o gerenciamento automáticos das reuniões dependem de autorização institucional. Enquanto isso, você ainda pode consultar convites, histórico e detalhes já disponíveis no NITE Connect.";
  }
  if (state === "checking") return "Estamos consultando a disponibilidade da integração institucional.";
  return "A verificação atual não confirmou a disponibilidade da integração para Reuniões.";
}

export function GraphAuthorizationView({ state, statusMessage, isChecking = false, onCheckAgain }: Props) {
  const isConsentRequired = state === "consent-required";
  const busy = state === "checking" || isChecking;

  return (
    <main className={styles.page} aria-busy={busy}>
      <header className={styles.header}>
        <BrandMark />
      </header>

      <section className={styles.content} aria-labelledby="graph-error-title">
        <GraphAuthorizationIllustration />

        <div className={styles.errorPill}>
          {isConsentRequired ? "Erro 403" : state === "checking" ? "Conexão institucional" : "Verificação do Microsoft 365"}
        </div>

        <h1 id="graph-error-title" className={styles.title}>{statusHeading(state)}</h1>
        <p className={styles.description}>{statusDescription(state)}</p>

        {isConsentRequired ? (
          <p className={styles.technicalCode}>Código: 403 · OBO_CONSENT_REQUIRED</p>
        ) : null}

        <div className={styles.actions}>
          <Link className={`${styles.button} ${styles.primaryButton}`} href="/reunioes">
            <CalendarIcon />
            <span>Voltar para Reuniões</span>
          </Link>
          <button className={`${styles.button} ${styles.secondaryButton}`} type="button" onClick={onCheckAgain} disabled={busy}>
            <RefreshIcon spinning={busy} />
            <span>{busy ? "Verificando…" : "Verificar novamente"}</span>
          </button>
        </div>

        <p className={styles.statusMessage} aria-live="polite" aria-atomic="true">
          {statusMessage ?? " "}
        </p>

        <p className={styles.note}>
          Quando a autorização for concedida, o fluxo completo de Reuniões poderá ser habilitado após a validação da integração.
        </p>
      </section>
    </main>
  );
}
