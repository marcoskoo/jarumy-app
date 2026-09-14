import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://jarumy-arq.vercel.app"),
  title: "Jarumy app — Suite arquitectónica CAD · BIM · Render",
  description: "Suite de diseño arquitectónico con herramientas recopiladas de AutoCAD, Revit, ArchiCAD, SketchUp, Rhino, Lumion y V-Ray. Menú radial contextual, planos en la nube, IA y PWA offline.",
  keywords: ["Jarumy", "arquitectura", "CAD", "BIM", "AutoCAD", "Revit", "plano", "menú radial", "RNE", "metrados"],
  authors: [{ name: "Arq. Jarumy" }],
  manifest: "/manifest.webmanifest",
  applicationName: "Jarumy",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Jarumy" },
  icons: {
    icon: [{ url: "/logo-jarumy-icon.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  openGraph: {
    title: "Jarumy app — Suite arquitectónica",
    description: "Suite de diseño arquitectónico: CAD, BIM y render con menú radial contextual sobre el plano.",
    url: "https://jarumy-arq.vercel.app",
    siteName: "Jarumy app",
    images: [{ url: "/logo-jarumy-icon.png", width: 512, height: 512, alt: "Arq. Jarumy" }],
    type: "website",
    locale: "es_PE",
  },
  twitter: {
    card: "summary",
    title: "Jarumy app — Suite arquitectónica",
    description: "Suite de diseño arquitectónico: CAD, BIM y render con menú radial contextual sobre el plano.",
    images: ["/logo-jarumy-icon.png"],
  },
};

// viewport de aplicación: el lienzo CAD gestiona su propio zoom (pellizco),
// pero NO bloqueamos el zoom nativo — accesibilidad (WCAG 1.4.4): usuarios
// con baja visión deben poder ampliar el navegador.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#18181b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
