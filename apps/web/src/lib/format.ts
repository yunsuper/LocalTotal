export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB"];
    let value = bytes / 1024;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i++;
    }
    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("ko-KR");
}

export function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString("ko-KR");
}
