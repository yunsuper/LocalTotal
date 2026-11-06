"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "lt-theme";

// <html class="dark"> 변화를 구독해서 현재 테마를 읽는다
function subscribe(onChange: () => void) {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
    });
    return () => observer.disconnect();
}

const getSnapshot = (): Theme =>
    document.documentElement.classList.contains("dark") ? "dark" : "light";

// 서버 렌더링 시에는 테마를 모르므로 null → 하이드레이션 불일치 방지
const getServerSnapshot = (): Theme | null => null;

function applyTheme(theme: Theme) {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
        localStorage.setItem(STORAGE_KEY, theme);
    } catch {
        // 저장 실패 시에도 현재 화면에는 적용됨
    }
}

const OPTIONS: { value: Theme; label: string }[] = [
    { value: "light", label: "라이트" },
    { value: "dark", label: "다크" },
];

export function ThemeToggle() {
    const theme = useSyncExternalStore<Theme | null>(
        subscribe,
        getSnapshot,
        getServerSnapshot,
    );

    return (
        <div
            role="radiogroup"
            aria-label="테마"
            className={`flex shrink-0 rounded-lg border border-zinc-200 p-0.5 text-sm dark:border-zinc-800 ${
                theme === null ? "invisible" : ""
            }`}
        >
            {OPTIONS.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={theme === o.value}
                    onClick={() => applyTheme(o.value)}
                    className={`rounded-md px-3 py-1 ${
                        theme === o.value
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                    }`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}
