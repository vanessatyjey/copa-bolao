import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Bolão da Família",
    template: "%s | Bolão da Família",
  },
  description: "Aposte no placar dos jogos da Copa do Mundo com a família.",
  applicationName: "Bolão da Família",
  authors: [{ name: "Vanessa de Freitas" }],
  keywords: [
    "Bolão",
    "Copa do Mundo",
    "Futebol",
    "Brasil",
    "Palpites",
    "Ranking",
  ],
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}