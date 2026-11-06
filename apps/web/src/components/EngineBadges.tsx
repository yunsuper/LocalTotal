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

    return (
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
}
