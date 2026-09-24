import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DriverAuthProvider } from "@/lib/DriverAuthContext";
import TopBar from "./TopBar";
import PushRegistration from "./PushRegistration";
import CapacitorBackButton from "./CapacitorBackButton";
import OfflineBanner from "./OfflineBanner";

export const metadata: Metadata = {
  title: "سُكّر",
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
    title: "سُكّر",
  },
};

export const viewport: Viewport = {
  themeColor: "#A5604F",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <CapacitorBackButton />
        <OfflineBanner />
        <DriverAuthProvider>
          <PushRegistration />
          <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
            <TopBar />
            <main className="max-w-md mx-auto px-4 py-4">{children}</main>
          </div>
        </DriverAuthProvider>
      </body>
    </html>
  );
}
