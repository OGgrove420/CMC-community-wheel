import type { Metadata } from "next";
import "@solana/wallet-adapter-react-ui/styles.css";

export const metadata: Metadata = {
  title: "CMC community wheel",
  description: "wallet-verified Solana community giveaways",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
