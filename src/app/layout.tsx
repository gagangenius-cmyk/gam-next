import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { QueryProvider } from '@/components/providers/QueryProvider';
import { Toaster } from '@/components/ui/toaster';
import { FormValidationProvider } from '@/components/ui/form-validation-provider';

export const metadata: Metadata = {
  title: "Go Abroad Migration - CRM",
  description: "Lead, client, operations, and reporting platform for Go Abroad Migration.",
  icons: {
    icon: [{ url: '/gam-icon.png', type: 'image/png' }],
    apple: '/gam-apple-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Light is the default; apply a saved dark choice before first paint so there is no flash. */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('gam-theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light')}catch(e){document.documentElement.setAttribute('data-theme','light')}" }} />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <QueryProvider>
          <AuthProvider>
            {children}
            <FormValidationProvider />
            <Toaster />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
