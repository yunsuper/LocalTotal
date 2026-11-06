"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
    { href: "/", label: "검사" },
    { href: "/quarantine", label: "격리함" },
    { href: "/settings", label: "설정" },
];

export function AppHeader() {
    const pathname = usePathname();

    return (
        <header className="mb-8">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        LocalTotal
                    </h1>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        파일 내용은 이 Mac 밖으로 나가지 않습니다.
                        VirusTotal에는 SHA-256 해시만 조회합니다.
                    </p>
                </div>
                <ThemeToggle />
            </div>
            <nav className="mt-6 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
                {NAV.map((item) => {
                    const active = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                                active
                                    ? "border-zinc-900 font-semibold dark:border-zinc-100"
                                    : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                            }`}
                        >
                            {item.label}
                        </Link>
                    );
                })}
            </nav>
        </header>
    );
}
