import type { Metadata } from "next";
import { Manrope, Outfit } from "next/font/google";
import "./globals.css";
import "./operator-fixes.css";
import "./payment-diagnostics.css";
import "./payment-methods.css";
import "./financial.css";
import "./users.css";
import "./integration.css";

const manrope = Manrope({ variable: "--font-body", subsets: ["latin"] });
const outfit = Outfit({ variable: "--font-display", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Conecta+ | Portal Wi-Fi",
  description: "Portal de acesso e gestão de internet Wi-Fi para redes MikroTik.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className={`${manrope.variable} ${outfit.variable}`}>{children}</body></html>;
}
