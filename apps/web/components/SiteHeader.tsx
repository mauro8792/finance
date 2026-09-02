import Link from "next/link";
import { APP_NAME } from "shared";
import styles from "./SiteHeader.module.css";

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        {APP_NAME}
      </Link>
      <nav className={styles.nav} aria-label="Principal">
        <Link href="/" className={styles.homeLink}>
          Inicio
        </Link>
        <Link href="/transactions" className={`${styles.homeLink} ${styles.desktopOnly}`}>
          Movimientos
        </Link>
        <Link href="/accounts" className={`${styles.homeLink} ${styles.desktopOnly}`}>
          Cuentas
        </Link>
        <Link href="/transfers" className={`${styles.homeLink} ${styles.desktopOnly}`}>
          Mover dinero
        </Link>
        <Link href="/budgets" className={`${styles.homeLink} ${styles.desktopOnly}`}>
          Presupuestos
        </Link>
        <Link href="/housing" className={`${styles.homeLink} ${styles.desktopOnly}`}>
          Vivienda
        </Link>
        <Link href="/investments" className={`${styles.homeLink} ${styles.desktopOnly}`}>
          Inversiones
        </Link>
        <Link href="/simulations" className={`${styles.homeLink} ${styles.desktopOnly}`}>
          Simulaciones
        </Link>
        <details className={styles.more}>
          <summary className={styles.moreSummary}>Más</summary>
          <div className={styles.moreMenu}>
            <Link href="/transactions" className={styles.moreLink}>
              Movimientos
            </Link>
            <Link href="/accounts" className={styles.moreLink}>
              Cuentas
            </Link>
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
          </div>
        </details>
        <Link href="/registrar" className={styles.navLink}>
          Registrar
        </Link>
      </nav>
    </header>
  );
}
