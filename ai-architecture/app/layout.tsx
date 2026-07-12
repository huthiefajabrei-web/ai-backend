import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const outfit = Outfit({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://gen-lang-client-0550261552.web.app"
  ),
  title: {
    default: "H_ARCH Studio | AI Architectural Visualization",
    template: "%s | H_ARCH Studio",
  },
  description:
    "Transform sketches and blueprints into stunning, highly realistic architectural renders instantly with our advanced AI engine.",
  keywords: [
    "AI architecture",
    "architectural visualization",
    "3D render",
    "interior design AI",
    "exterior render",
  ],
  openGraph: {
    title: "H_ARCH Studio | AI Architectural Visualization",
    description:
      "Transform sketches and blueprints into photorealistic architectural renders with AI.",
    type: "website",
    locale: "en_US",
    siteName: "H_ARCH Studio",
  },
  twitter: {
    card: "summary_large_image",
    title: "H_ARCH Studio",
    description: "AI-powered architectural visualization studio.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${outfit.variable} antialiased bg-[#040508] text-slate-50`}
      >
        {children}
      </body>
    </html>
  );
}
