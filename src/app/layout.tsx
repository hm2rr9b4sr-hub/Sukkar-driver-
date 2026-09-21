import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DriverAuthProvider } from "@/lib/DriverAuthContext";
import TopBar from "./TopBar";

export const metadata: Metadata = {
  title: "Sukkar Driver",
  description: "تطبيق مندوبي التوصيل لأسطول سُكّر",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sukkar Driver",
  },
};

export const viewport: Viewport = {
  themeColor: "#D97706",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <DriverAuthProvider>
          <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
            <TopBar />
            <main className="max-w-md mx-auto px-4 py-4">{children}</main>
          </div>
        </DriverAuthProvider>
      </body>
    </html>
  );
}
