import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { APP_NAME } from "shared";
import { RegisterServiceWorker } from "../components/RegisterServiceWorker";
import { Providers } from "../components/Providers";
import { AuthGate, AuthHeader, AuthProvider } from "../components/AuthProvider";
import "./globals.css";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description:
    "Gestión financiera personal durante una etapa de transición laboral",
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    title: "Runway",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <RegisterServiceWorker />
        <Providers>
          <AuthProvider>
            <div className={styles.shell}>
              <AuthHeader />
              <main className={styles.main}>
                <AuthGate>{children}</AuthGate>
              </main>
            </div>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
