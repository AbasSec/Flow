import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flow for Food & Beverage",
  description: "Flow competition demo for Food & Beverage operations."
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
