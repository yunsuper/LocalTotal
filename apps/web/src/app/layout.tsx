import type { Metadata } from "next";
import Script from "next/script";
import { PlatformProvider } from "@/components/PlatformProvider";
import "./globals.css";

export const metadata: Metadata = {
    title: "LocalTotal",
    description: "로컬 악성코드 수동 검사 도구",
};

// 저장된 테마(없으면 OS 설정)를 렌더링 전에 적용해 깜빡임 방지
const themeScript = `(function(){try{var t=localStorage.getItem('lt-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.classList.toggle('dark',t==='dark');}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ko" suppressHydrationWarning>
            <body className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
                <Script id="lt-theme" strategy="beforeInteractive">
                    {themeScript}
                </Script>
                {/* Next.js 서버 = API·검사 대상과 같은 PC이므로 서버의 OS로 화면 문구를 고른다 */}
                <PlatformProvider platform={process.platform}>
                    {children}
                </PlatformProvider>
            </body>
        </html>
    );
}
