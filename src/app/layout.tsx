import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MessMate — Shared living, sorted",
    template: "%s · MessMate",
  },
  description:
    "Track meals, bazar runs and shared bills for your mess, and settle the month in minutes instead of an evening with a spreadsheet.",
  applicationName: "MessMate",
  appleWebApp: { capable: true, title: "MessMate", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: {
    title: "MessMate — Shared living, sorted",
    description: "Meals, bazar and bills for shared homes, settled automatically.",
    siteName: "MessMate",
    type: "website",
  },
  // The app is entirely behind a sign-in, so there is nothing useful to index.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7f4" },
    { media: "(prefers-color-scheme: dark)", color: "#12201b" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
