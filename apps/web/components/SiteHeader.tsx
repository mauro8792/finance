import Link from "next/link";
import { APP_NAME } from "shared";
import { PrivacyToggle } from "./PrivacyToggle";
import styles from "./SiteHeader.module.css";

export function SiteHeader({ onLogout }: { onLogout?: () => void }) {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        {APP_NAME}
      </Link>
      <nav className={styles.nav} aria-label="Principal">
        <div className={styles.desktopNav}>
          <Link href="/" className={styles.homeLink}>
            Inicio
          </Link>
          <Link href="/transactions" className={styles.homeLink}>
            Movimientos
          </Link>
          <Link href="/accounts" className={styles.homeLink}>
            Cuentas
          </Link>
          <Link href="/cards" className={styles.homeLink}>
            Tarjetas
          </Link>
          <details className={styles.more}>
            <summary className={styles.moreSummary}>Más</summary>
            <div className={styles.moreMenu}>
              <Link href="/transfers" className={styles.moreLink}>
                Mover dinero
              </Link>
              <Link href="/budgets" className={styles.moreLink}>
                Presupuestos
              </Link>
              <Link href="/housing" className={styles.moreLink}>
                Vivienda
              </Link>
              <Link href="/investments" className={styles.moreLink}>
                Inversiones
              </Link>
              <Link href="/simulations" className={styles.moreLink}>
                Simulaciones
              </Link>
              <Link href="/assistant" className={styles.moreLink}>
                Asistente
              </Link>
            </div>
          </details>
          <Link href="/registrar" className={styles.navLink}>
            Registrar
          </Link>
        </div>
        <PrivacyToggle />
        {onLogout ? (
          <button type="button" className={styles.logout} onClick={onLogout}>
            Salir
          </button>
        ) : null}
      </nav>
    </header>
  );
}
