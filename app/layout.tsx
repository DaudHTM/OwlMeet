import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OwlMeet — Find your people at Rice",
  description: "Meet Rice students through casual, student-led events.",
  applicationName: "OwlMeet",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "OwlMeet", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f7f3e8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
