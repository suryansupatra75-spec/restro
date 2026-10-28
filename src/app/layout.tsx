import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "RestaurantSaaS — Digital Menus & QR Table Ordering for Restaurants",
  description:
    "Transform your restaurant with digital QR menus and table ordering. Customers scan, browse, and order — your team manages everything from one dashboard.",
  keywords: [
    "restaurant management",
    "QR menu",
    "digital menu",
    "table ordering",
    "restaurant SaaS",
    "food ordering",
  ],
  openGraph: {
    title: "RestaurantSaaS — Digital Menus & QR Table Ordering",
    description:
      "Transform your restaurant with digital QR menus and table ordering. Customers scan, browse, and order — your team manages everything from one dashboard.",
    type: "website",
    locale: "en_US",
    siteName: "RestaurantSaaS",
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
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
