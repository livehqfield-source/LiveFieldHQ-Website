import type { Metadata } from "next";
import type { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "LiveFieldHQ",
    template: "%s · LiveFieldHQ",
  },
  description: "LiveFieldHQ — Roblox game operations dashboard",
  icons: {
    icon: [
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: { url: "/icon.png", sizes: "512x512" },
  },
  openGraph: {
    title: "LiveFieldHQ",
    description: "LiveFieldHQ — Roblox game operations dashboard",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "LiveFieldHQ logo" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <Sidebar />
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
