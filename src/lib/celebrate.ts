/** Comemoração leve: confete em CSS/JS puro e um "plim" suave (só se a pessoa ligou os sons). */
const SOUND_KEY = "vida:sounds";

export const soundsEnabled = () => {
  try {
    return localStorage.getItem(SOUND_KEY) === "on";
  } catch {
    return false;
  }
};
export const setSoundsEnabled = (on: boolean) => {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* ok */
  }
};

export function chime() {
  if (!soundsEnabled()) return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.12, now + i * 0.1 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.1 + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(now + i * 0.1);
      o.stop(now + i * 0.1 + 0.55);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch {
    /* sem áudio */
  }
}

const COLORS = ["#f5b335", "#e08a5b", "#5bb98b", "#5b9be0", "#c47be0", "#ff7aa8"];

/** Chuva de confete por ~1,6s. Respeita "reduzir animações" e o modo calmo. */
export function celebrate() {
  if (typeof document === "undefined") return;
  const reduce =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.hasAttribute("data-a11y-motion");
  chime();
  if (reduce) return;

  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:500";
  document.body.appendChild(layer);

  for (let i = 0; i < 70; i++) {
    const p = document.createElement("span");
    const size = 6 + Math.random() * 7;
    const startX = 50 + (Math.random() - 0.5) * 30;
    const dx = (Math.random() - 0.5) * 70;
    const rot = Math.random() * 720 - 360;
    const dur = 1100 + Math.random() * 900;
    p.style.cssText = `position:absolute;left:${startX}%;top:55%;width:${size}px;height:${size * 0.5}px;border-radius:2px;background:${COLORS[i % COLORS.length]};opacity:1;`;
    layer.appendChild(p);
    p.animate(
      [
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx}vw, ${-30 - Math.random() * 25}vh) rotate(${rot / 2}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${dx * 1.3}vw, ${40 + Math.random() * 30}vh) rotate(${rot}deg)`, opacity: 0 },
      ],
      { duration: dur, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" },
    );
  }
  setTimeout(() => layer.remove(), 2200);
}
