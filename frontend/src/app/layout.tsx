import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0a0a0f",
};

export const metadata: Metadata = {
  title: "RapPhim - Xem Phim Online Miễn Phí",
  description: "Xem phim mới nhất, phim bộ, phim lẻ, anime vietsub chất lượng cao hoàn toàn miễn phí tại RapPhim.",
  keywords: "xem phim, phim vietsub, anime, phim bộ, phim lẻ, phim chiếu rạp",
  appleWebApp: {
    capable: true,
    title: "RapPhim",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>
        <Navbar />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
