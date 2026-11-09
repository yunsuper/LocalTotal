import { ENGINE_LABEL } from "@/lib/labels";
import type { EngineStatus } from "@/lib/types";

interface Props {
    engines: EngineStatus[] | null;
    error: string | null;
}

export function EngineBadges({ engines, error }: Props) {
    if (error)
        return (
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        );
    if (!engines)
        return <p className="text-sm text-zinc-500">엔진 상태 확인 중…</p>;

    // macOS에서는 안내가 없어 목록만 그린다 (M7 이전과 같은 화면)
    const notices = engines.filter((e) => e.notice);
    const list = (
        <ul className="flex flex-wrap gap-2">
            {engines.map((e) => (
                <li
                    key={e.name}
                    title={e.version ?? "사용 불가"}
                    className="flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                    <span
                        className={`h-2 w-2 rounded-full ${
                            e.available
                                ? "bg-emerald-500 dark:bg-emerald-400"
                                : "bg-zinc-400 dark:bg-zinc-600"
                        }`}
                    />
                    {ENGINE_LABEL[e.name]}
                    <span className="text-zinc-500">
                        {e.available ? "사용 가능" : "사용 불가"}
                    </span>
                    {e.available && e.usage && (
                        <span className="text-xs text-zinc-500">
                            · 오늘 {e.usage.today}/{e.usage.limit}
                        </span>
                    )}
                </li>
            ))}
        </ul>
    );
    if (notices.length === 0) return list;

    return (
        <div className="space-y-2">
            {list}
            {notices.map((e) => (
                <p
                    key={e.name}
                    className={`rounded-md border px-3 py-2 text-xs ${
                        e.notice!.level === "warn"
                            ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                            : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                    }`}
                >
                    <span className="font-semibold">{ENGINE_LABEL[e.name]}</span>
                    {" · "}
                    {e.notice!.message}
                </p>
            ))}
        </div>
    );
}
