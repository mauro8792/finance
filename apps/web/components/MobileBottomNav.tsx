"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { BottomSheet } from "./ui/BottomSheet";
import styles from "./MobileBottomNav.module.css";

const PRIMARY_ITEMS = [
  { href: "/", label: "Inicio", icon: <HomeIcon /> },
  { href: "/registrar", label: "Registrar", icon: <PlusIcon /> },
  { href: "/transactions", label: "Movimientos", icon: <ListIcon /> },
  { href: "/accounts", label: "Cuentas", icon: <WalletIcon /> },
] as const;

const MORE_ITEMS = [
  { href: "/investments", label: "Inversiones" },
  { href: "/housing", label: "Vivienda" },
  { href: "/cards", label: "Tarjetas" },
  { href: "/transfers", label: "Mover dinero" },
  { href: "/budgets", label: "Presupuestos" },
  { href: "/simulations", label: "Simulaciones" },
  { href: "/assistant", label: "Asistente" },
] as const;

export function MobileBottomNav({ onLogout }: { onLogout?: () => void }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreIsActive = MORE_ITEMS.some((item) => pathname === item.href);

  return (
    <>
      <nav className={styles.nav} aria-label="Navegación principal móvil">
        {PRIMARY_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.item} ${pathname === item.href ? styles.active : ""}`.trim()}
            aria-current={pathname === item.href ? "page" : undefined}
          >
            <span className={styles.icon}>{item.icon}</span>
            <span className={styles.label}>{item.label}</span>
          </Link>
        ))}
        <button
          type="button"
          className={`${styles.item} ${moreIsActive ? styles.active : ""}`.trim()}
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
        >
          <span className={styles.icon}>
            <MoreIcon />
          </span>
          <span className={styles.label}>Más</span>
        </button>
      </nav>
      {moreOpen ? (
        <BottomSheet title="Más secciones" onClose={() => setMoreOpen(false)}>
          <div className={styles.sheetLinks}>
            {MORE_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={styles.sheetLink}
                onClick={() => setMoreOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            {onLogout ? (
              <button
                type="button"
                className={styles.sheetLogout}
                onClick={() => {
                  setMoreOpen(false);
                  onLogout();
                }}
              >
                Salir
              </button>
            ) : null}
          </div>
        </BottomSheet>
      ) : null}
    </>
  );
}

function Icon({ path }: { path: string }): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path fill="currentColor" d={path} />
    </svg>
  );
}

function HomeIcon() {
  return <Icon path="M12 3 3 10.2V21h6v-6h6v6h6V10.2L12 3Z" />;
}

function PlusIcon() {
  return <Icon path="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" />;
}

function ListIcon() {
  return (
    <Icon path="M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h10v2H4v-2Z" />
  );
}

function WalletIcon() {
  return (
    <Icon path="M4 5h13a2 2 0 0 1 2 2v1h1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm12 6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
  );
}

function MoreIcon() {
  return (
    <Icon path="M6 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
  );
}
