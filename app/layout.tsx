import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import type { ReactNode } from "react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "St Gianna Specialist Hospital",
    template: "%s | St Gianna Specialist Hospital"
  },
  description: "St Gianna Specialist Hospital, Transekulu, Enugu."
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var m=localStorage.getItem('st-gianna-theme-mode')||'auto';var d=false;if(m==='dark')d=true;else if(m==='system')d=matchMedia('(prefers-color-scheme: dark)').matches;else if(m==='auto'){var h=Number(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hour12:false,timeZone:'Africa/Lagos'}).format(new Date()));d=h>=19||h<6}document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})();` }} />
      </head>
      <body className={`${inter.className} min-h-screen w-full antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
