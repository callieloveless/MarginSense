import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MarginSense",
  description: "Is this estimate worth the crew hours it takes?",
};

// Phone-first (constitution §1): lock the viewport to device width.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        {children}
      </body>
    </html>
  );
}
