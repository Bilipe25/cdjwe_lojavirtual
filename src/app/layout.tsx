import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CDJWE Estofados — Portal B2B",
    template: "%s | CDJWE B2B",
  },
  description:
    "Portal de vendas B2B para lojistas — catálogo de sofás, tecidos e cores. Faça seus pedidos de atacado online.",
  keywords: ["B2B", "estofados", "sofás", "atacado", "lojista", "tecidos"],
  authors: [{ name: "CDJWE Estofados" }],
  openGraph: {
    title: "CDJWE Estofados — Portal B2B",
    description: "Portal de vendas B2B para lojistas",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#1a2744",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${outfit.variable} antialiased`}
        suppressHydrationWarning
      >
        <QueryProvider>
          <TooltipProvider>
            {children}
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
