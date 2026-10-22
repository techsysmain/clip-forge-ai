"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body && !(init.body instanceof Blob) ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login";
    throw new Error((data as { error?: string }).error ?? "Request failed.");
  }
  return data as T;
}

const MIME_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  m4v: "video/x-m4v",
};

export function uploadFile(url: string, file: File, onProgress: (f: number) => void): Promise<void> {
  const type = file.type || MIME_BY_EXT[file.name.split(".").pop()?.toLowerCase() ?? ""] || "";
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      try {
        reject(new Error(JSON.parse(xhr.responseText).error));
      } catch {
        reject(new Error("Upload failed."));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
    xhr.send(file);
  });
}

/** Fetches JSON and re-polls while `shouldPoll(data)` is true. */
export function usePolled<T>(url: string | null, shouldPoll: (d: T) => boolean, intervalMs = 2000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(shouldPoll);
  pollRef.current = shouldPoll;

  const load = useCallback(async () => {
    if (!url) return null;
    try {
      const d = await api<T>(url);
      setData(d);
      setError(null);
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const d = await load();
      if (stopped) return;
      timer = setTimeout(tick, d && !pollRef.current(d) ? 15000 : intervalMs);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [load, intervalMs]);

  return { data, error, loading, reload: load };
}
