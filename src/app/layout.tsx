import type { Metadata } from "next";
import "./globals.css";
import { ReactFlowProvider } from "@xyflow/react";
import { AuthProvider } from "@/contexts/AuthContext";

export const metadata: Metadata = {
  title: "Idea.ai - Transform Goals into Plans",
  description: "AI-powered mind mapping to turn your ideas into actionable plans.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased text-text-main dark:text-surface-light bg-background-light dark:bg-background-dark bg-paper bg-repeat min-h-screen relative selection:bg-primary/30">
        {/* Global Noise Overlay */}
        <div className="fixed inset-0 pointer-events-none opacity-40 z-0 bg-noise mix-blend-overlay"></div>

        <div className="relative z-10 h-full">
          <AuthProvider>
            <ReactFlowProvider>
              {children}
            </ReactFlowProvider>
          </AuthProvider>
        </div>
      </body>
    </html>
  );
}
