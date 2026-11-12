import React from 'react';
import './globals.css';

export const metadata = {
  title: 'NeoBus — Enterprise Control Tower & ERP',
  description: 'NeoBus Office Desk & Interactive Owner Control Tower Web Application',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}

