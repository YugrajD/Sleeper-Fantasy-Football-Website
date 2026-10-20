import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UCDegens Hub",
  description: "UCDegens fantasy football power rankings and league analytics.",
  openGraph: {
    title: "UCDegens Hub",
    description: "UCDegens fantasy football league hub.",
    siteName: "UCDegens Hub",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "UCDegens Hub",
    description: "UCDegens fantasy football league hub.",
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "UCDegens Hub" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#08090a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
