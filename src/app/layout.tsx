import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Document Chat",
  description: "Upload PDFs and get answers with page-level sources.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
