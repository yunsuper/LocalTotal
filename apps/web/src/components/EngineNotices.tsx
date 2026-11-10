import { ENGINE_LABEL } from "@/lib/labels";
import type { EngineStatus } from "@/lib/types";

// 엔진 안내 (예: Windows Defender 샘플 제출 설정). 배지 줄 아래 전체 폭으로 표시한다.
// macOS에는 안내가 없으므로 아무것도 그리지 않는다 (M7 이전 화면 유지).
export function EngineNotices({ engines }: { engines: EngineStatus[] | null }) {
    const notices = (engines ?? []).filter((e) => e.notice);
    if (notices.length === 0) return null;

    return (
        <div className="-mt-3 mb-6 space-y-2">
            {notices.map((e) => (
                <p
                    key={e.name}
                    className={`rounded-md border px-3 py-2 text-xs ${
                        e.notice!.level === "warn"
                            ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                            : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                    }`}
                >
                    <span className="font-semibold">
                        {ENGINE_LABEL[e.name]}
                    </span>
                    {" · "}
                    {e.notice!.message}
                </p>
            ))}
        </div>
    );
}
