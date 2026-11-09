"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useOsTexts } from "@/components/PlatformProvider";
import {
    addExclusion,
    deleteExclusion,
    getSettings,
    listExclusions,
    updateSettings,
} from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { EXCLUSION_KIND_LABEL, EXCLUSION_MODE_LABEL } from "@/lib/labels";
import type {
    AppSettings,
    Exclusion,
    ExclusionKind,
    ExclusionMode,
} from "@/lib/types";

interface SettingsForm {
    useVirusTotal: boolean;
    vtAllThreshold: string;
    maxFileSizeMb: string;
}

const toForm = (s: AppSettings): SettingsForm => ({
    useVirusTotal: s.useVirusTotal,
    vtAllThreshold: String(s.vtAllThreshold),
    maxFileSizeMb: String(s.maxFileSizeMb),
});

const inputClass =
    "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950";
const cardClass =
    "rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50";
const primaryButton =
    "rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white";

export default function SettingsPage() {
    const [form, setForm] = useState<SettingsForm | null>(null);
    const [exclusions, setExclusions] = useState<Exclusion[] | null>(null);
    const [message, setMessage] = useState<{
        type: "ok" | "error";
        text: string;
    } | null>(null);
    const [saving, setSaving] = useState(false);

    const [kind, setKind] = useState<ExclusionKind>("folder");
    const [value, setValue] = useState("");
    const os = useOsTexts();
    const [mode, setMode] = useState<ExclusionMode>("scan_only");
    const [note, setNote] = useState("");
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        let cancelled = false;
        Promise.all([getSettings(), listExclusions()])
            .then(([settings, list]) => {
                if (cancelled) return;
                setForm(toForm(settings));
                setExclusions(list);
            })
            .catch((e: Error) => {
                if (!cancelled) setMessage({ type: "error", text: e.message });
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const reloadExclusions = useCallback(async () => {
        setExclusions(await listExclusions());
    }, []);

    const saveSettings = async (e: FormEvent) => {
        e.preventDefault();
        if (!form) return;
        setSaving(true);
        setMessage(null);
        try {
            const saved = await updateSettings({
                useVirusTotal: form.useVirusTotal,
                vtAllThreshold: Number(form.vtAllThreshold),
                maxFileSizeMb: Number(form.maxFileSizeMb),
            });
            setForm(toForm(saved));
            setMessage({ type: "ok", text: "설정을 저장했어요." });
        } catch (err) {
            setMessage({ type: "error", text: (err as Error).message });
        } finally {
            setSaving(false);
        }
    };

    const submitExclusion = async (e: FormEvent) => {
        e.preventDefault();
        if (!value.trim()) return;
        setAdding(true);
        setMessage(null);
        try {
            await addExclusion({
                kind,
                value: value.trim(),
                mode,
                note: note.trim() || undefined,
            });
            setValue("");
            setNote("");
            await reloadExclusions();
            setMessage({ type: "ok", text: "제외 목록에 추가했어요." });
        } catch (err) {
            setMessage({ type: "error", text: (err as Error).message });
        } finally {
            setAdding(false);
        }
    };

    const removeExclusion = async (id: string) => {
        setMessage(null);
        try {
            await deleteExclusion(id);
            await reloadExclusions();
            setMessage({ type: "ok", text: "제외 항목을 삭제했어요." });
        } catch (err) {
            setMessage({ type: "error", text: (err as Error).message });
        }
    };

    return (
        <main className="mx-auto max-w-3xl px-6 py-12">
            <AppHeader />

            {message && (
                <p
                    className={`mb-6 rounded-md border px-4 py-2 text-sm ${
                        message.type === "ok"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
                            : "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
                    }`}
                >
                    {message.text}
                </p>
            )}

            {/* 기본 설정 */}
            <section className="mb-10">
                <h2 className="mb-3 text-lg font-semibold">기본 설정</h2>
                {!form ? (
                    <p className="text-sm text-zinc-500">불러오는 중…</p>
                ) : (
                    <form
                        onSubmit={saveSettings}
                        className={`${cardClass} space-y-4`}
                    >
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={form.useVirusTotal}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        useVirusTotal: e.target.checked,
                                    })
                                }
                                className="h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
                            />
                            검사할 때 VirusTotal 해시 조회를 기본으로 켜기
                        </label>

                        <label className="block text-sm">
                            <span className="mb-1 block">
                                VirusTotal 전체 조회 기준 (파일 개수)
                            </span>
                            <input
                                type="number"
                                min={0}
                                max={500}
                                value={form.vtAllThreshold}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        vtAllThreshold: e.target.value,
                                    })
                                }
                                className={`${inputClass} w-32`}
                            />
                            <span className="mt-1 block text-xs text-zinc-500">
                                이 개수 이하면 모든 파일을 조회하고, 넘으면
                                ClamAV가 탐지한 파일만 조회해요. (0~500)
                            </span>
                        </label>

                        <label className="block text-sm">
                            <span className="mb-1 block">
                                최대 파일 크기 (MB)
                            </span>
                            <input
                                type="number"
                                min={1}
                                max={200}
                                value={form.maxFileSizeMb}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        maxFileSizeMb: e.target.value,
                                    })
                                }
                                className={`${inputClass} w-32`}
                            />
                            <span className="mt-1 block text-xs text-zinc-500">
                                이보다 큰 파일은 ClamAV 검사를 건너뛰어요. clamd
                                설정 한도가 200MB예요. (1~200)
                            </span>
                        </label>

                        <button
                            type="submit"
                            disabled={saving}
                            className={primaryButton}
                        >
                            {saving ? "저장 중…" : "저장"}
                        </button>
                    </form>
                )}
            </section>

            {/* 제외 목록 */}
            <section>
                <h2 className="mb-1 text-lg font-semibold">제외 목록</h2>
                <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                    오탐이 잦은 폴더(MO2 등)를 등록하면 격리 버튼이 비활성화되고
                    &quot;오탐 의심&quot;으로 표시돼요.
                </p>

                <form
                    onSubmit={submitExclusion}
                    className={`${cardClass} mb-4 space-y-3`}
                >
                    <div className="flex flex-wrap gap-2">
                        <select
                            value={kind}
                            onChange={(e) =>
                                setKind(e.target.value as ExclusionKind)
                            }
                            className={inputClass}
                        >
                            <option value="folder">폴더</option>
                            <option value="file">파일</option>
                            <option value="hash">해시 (SHA-256)</option>
                        </select>
                        <select
                            value={mode}
                            onChange={(e) =>
                                setMode(e.target.value as ExclusionMode)
                            }
                            className={inputClass}
                        >
                            <option value="scan_only">
                                {EXCLUSION_MODE_LABEL.scan_only}
                            </option>
                            <option value="skip">
                                {EXCLUSION_MODE_LABEL.skip}
                            </option>
                        </select>
                    </div>
                    <input
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder={
                            kind === "hash"
                                ? "SHA-256 64자리"
                                : os.folderPlaceholder
                        }
                        spellCheck={false}
                        className={`${inputClass} w-full font-mono`}
                    />
                    <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="메모 (선택) — 예: MO2 모드팩, Defender 오탐"
                        className={`${inputClass} w-full`}
                    />
                    <button
                        type="submit"
                        disabled={adding || !value.trim()}
                        className={primaryButton}
                    >
                        {adding ? "추가 중…" : "제외 목록에 추가"}
                    </button>
                </form>

                {exclusions === null ? (
                    <p className="text-sm text-zinc-500">불러오는 중…</p>
                ) : exclusions.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
                        제외 항목이 없어요.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {exclusions.map((ex) => (
                            <li
                                key={ex.id}
                                className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
                            >
                                <div className="min-w-0">
                                    <p className="text-xs text-zinc-500">
                                        {EXCLUSION_KIND_LABEL[ex.kind]} ·{" "}
                                        {EXCLUSION_MODE_LABEL[ex.mode]} ·{" "}
                                        {formatDateTime(ex.createdAt)}
                                    </p>
                                    <p className="break-all font-mono text-sm">
                                        {ex.value}
                                    </p>
                                    {ex.note && (
                                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                            {ex.note}
                                        </p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void removeExclusion(ex.id)}
                                    className="shrink-0 rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                                >
                                    삭제
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </main>
    );
}
