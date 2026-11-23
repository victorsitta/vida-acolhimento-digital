import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { QueueEntry } from "@/types";

const KEY = "vida:queue-sound";

/** Toca um "plim" curto (sem arquivo de áudio). */
export function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1318].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + 0.32);
    });
    setTimeout(() => ctx.close(), 900);
  } catch {
    /* sem áudio disponível */
  }
}

/** Avisa o voluntário quando alguém novo entra na fila: som, aviso do navegador e mensagem. */
export function useQueueAlerts(entries: QueueEntry[] | undefined, enabled = true) {
  const [sound, setSoundState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) !== "off";
    } catch {
      return true;
    }
  });
  const known = useRef<Set<string> | null>(null);

  const setSound = (on: boolean) => {
    setSoundState(on);
    try {
      localStorage.setItem(KEY, on ? "on" : "off");
    } catch {
      /* ok */
    }
    if (on) {
      beep();
      if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    }
  };

  useEffect(() => {
    if (!enabled || !entries) return;
    const ids = new Set(entries.map((e) => e.id));
    if (known.current) {
      const fresh = entries.filter((e) => !known.current!.has(e.id));
      if (fresh.length) {
        const crisis = fresh.some((e) => e.priority === "crise");
        toast(crisis ? "🔴 Pessoa em crise na fila" : `Nova pessoa na fila (${fresh.length})`, {
          description: fresh.map((e) => e.alias).join(", "),
        });
        if (sound) {
          beep();
          if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
            try {
              new Notification(crisis ? "Pessoa em crise aguardando" : "Nova pessoa na fila", {
                body: fresh.map((e) => e.alias).join(", "),
                tag: "vida-queue",
              });
            } catch {
              /* ok */
            }
          }
        }
      }
    }
    known.current = ids;
  }, [entries, enabled, sound]);

  return { sound, setSound };
}
