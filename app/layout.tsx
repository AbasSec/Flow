import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flow Bootstrap",
  description: "Milestone 1 bootstrap baseline for Flow."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
