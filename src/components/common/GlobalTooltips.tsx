import { useEffect, useRef, useState } from "react";

interface Tip {
  text: string;
  x: number;
  y: number;
  below: boolean;
}

const SELECTOR = "[data-tip],[title],button[aria-label],a[aria-label],[role='button'][aria-label]";

/** Texto da dica: data-tip, title (convertido) ou aria-label de botões só com ícone. */
function tipTextOf(el: HTMLElement): string | null {
  const dataTip = el.getAttribute("data-tip");
  if (dataTip) return dataTip;

  const title = el.getAttribute("title");
  if (title) {
    // tira o balão feio do navegador e guarda o texto para o nosso
    el.setAttribute("data-tip", title);
    el.removeAttribute("title");
    return title;
  }

  const label = el.getAttribute("aria-label");
  if (label) {
    const visible = (el.textContent ?? "").replace(/\s+/g, "").length > 0;
    const sr = el.querySelector(".sr-only");
    // só botões de ícone (sem texto visível) ganham dica pelo aria-label
    if (!visible || (sr && (el.textContent ?? "").trim() === (sr.textContent ?? "").trim())) return label;
  }
  return null;
}

/**
 * Dicas (tooltips) para o sistema inteiro, num só lugar:
 * - aparecem ao passar o mouse (depois de uma pausa) ou ao focar com o teclado;
 * - não aparecem em toque, para não atrapalhar;
 * - são "transparentes" ao clique (pointer-events: none), então nunca bloqueiam nada.
 */
export function GlobalTooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<number | null>(null);
  const current = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const clear = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      current.current = null;
      setTip(null);
    };

    const show = (el: HTMLElement, delay: number) => {
      const text = tipTextOf(el);
      if (!text || (el as HTMLButtonElement).disabled === true && !el.getAttribute("data-tip")) return;
      if (current.current === el) return;
      clear();
      current.current = el;
      timer.current = window.setTimeout(() => {
        if (!document.contains(el)) return;
        const r = el.getBoundingClientRect();
        const below = r.top < 56;
        setTip({
          text,
          x: Math.min(window.innerWidth - 12, Math.max(12, r.left + r.width / 2)),
          y: below ? r.bottom + 8 : r.top - 8,
          below,
        });
      }, delay);
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = (e.target as HTMLElement | null)?.closest?.(SELECTOR) as HTMLElement | null;
      if (!el) return clear();
      show(el, 380);
    };
    const onOut = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const next = (e.relatedTarget as HTMLElement | null)?.closest?.(SELECTOR);
      if (!next || next !== current.current) clear();
    };
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      // só teclado: foco por clique não abre dica
      if (!t.matches?.(":focus-visible")) return;
      const el = t.closest?.(SELECTOR) as HTMLElement | null;
      if (el) show(el, 150);
    };

    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerout", onOut, true);
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("focusout", clear, true);
    document.addEventListener("pointerdown", clear, true);
    document.addEventListener("keydown", clear, true);
    window.addEventListener("scroll", clear, true);
    window.addEventListener("blur", clear);
    return () => {
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointerout", onOut, true);
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("focusout", clear, true);
      document.removeEventListener("pointerdown", clear, true);
      document.removeEventListener("keydown", clear, true);
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("blur", clear);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      role="tooltip"
      className="vida-tip"
      data-below={tip.below ? "true" : "false"}
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.text}
    </div>
  );
}
