import type { Metadata } from "next";
import { Inter, Kantumruy_Pro } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const kantumruyPro = Kantumruy_Pro({
  variable: "--font-kantumruy",
  subsets: ["khmer", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "KhLan ខ្លាន — Cambodia's Trusted Car Marketplace",
  description:
    "Buy and sell cars in Cambodia with confidence: verified listings, evidence-based AI vehicle reports, secure messaging. Khmer & English.",
  keywords: ["Cambodia", "car marketplace", "used cars", "ឡាន", "ខ្មែរ", "AI vehicle report"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${kantumruyPro.variable} antialiased bg-background text-foreground font-sans`}>
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
