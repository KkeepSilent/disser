import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TradeMind Education — тренажёр торговых решений",
  description: "Учебный симулятор рынка с движением цены по свечам, виртуальным балансом и наставником по управлению риском.",
  robots: { index: false, follow: false }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
