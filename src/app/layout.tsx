import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import { QueryProvider } from "@/components/providers/query-provider";
import { PwaRuntimeProvider } from "@/components/providers/pwa-runtime-provider";
import { ThemeProvider } from "next-themes";
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
  applicationName: "JWE B2B",
  title: {
    default: "JWE Centro de Distribuicao - Portal B2B",
    template: "%s | JWE B2B",
  },
  description:
    "Portal de vendas B2B para lojistas - catalogo de sofas, tecidos e cores. Faca seus pedidos de atacado online.",
  keywords: ["B2B", "estofados", "sofas", "atacado", "lojista", "tecidos", "JWE"],
  authors: [{ name: "JWE Centro de Distribuicao" }],
  openGraph: {
    title: "JWE Centro de Distribuicao - Portal B2B",
    description: "Portal de vendas B2B para lojistas",
    type: "website",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "JWE B2B",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#1a2744",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#1a2744" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#1a2744" media="(prefers-color-scheme: dark)" />
      </head>
      <body
        className={`${inter.variable} ${outfit.variable} antialiased`}
        suppressHydrationWarning
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-lg"
        >
          Pular para o conteudo
        </a>
        <PwaRuntimeProvider>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
            <QueryProvider>
              <TooltipProvider>
                {children}
                <Toaster richColors position="top-right" />
              </TooltipProvider>
            </QueryProvider>
          </ThemeProvider>
        </PwaRuntimeProvider>
      </body>
    </html>
  );
}
