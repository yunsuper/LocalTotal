"use client";

import { createContext, useContext } from "react";
import { osTexts, type OsTexts } from "@/lib/platform";

// 기본값은 macOS 문구 (Provider가 없어도 M7 이전과 같음)
const PlatformContext = createContext<string>("darwin");

export function PlatformProvider({
    platform,
    children,
}: {
    platform: string;
    children: React.ReactNode;
}) {
    return (
        <PlatformContext.Provider value={platform}>
            {children}
        </PlatformContext.Provider>
    );
}

export function useOsTexts(): OsTexts {
    return osTexts(useContext(PlatformContext));
}
