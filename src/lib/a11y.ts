/** Preferências de acessibilidade: salvas no navegador e aplicadas como atributos em <html>. */
export interface A11yPrefs {
  font: "normal" | "lg" | "xl" | "xxl";
  contrast: boolean;
  dyslexia: boolean;
  spacing: boolean;
  links: boolean;
  focus: boolean;
  motion: boolean; // true = reduzir animações
  calm: boolean; // true = fundo simples (sem enfeites)
  cursor: boolean;
}

export const DEFAULT_A11Y: A11yPrefs = {
  font: "normal",
  contrast: false,
  dyslexia: false,
  spacing: false,
  links: false,
  focus: false,
  motion: false,
  calm: false,
  cursor: false,
};

const KEY = "vida:a11y";

export function loadA11y(): A11yPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_A11Y, ...JSON.parse(raw) } : { ...DEFAULT_A11Y };
  } catch {
    return { ...DEFAULT_A11Y };
  }
}

export function applyA11y(p: A11yPrefs) {
  if (typeof document === "undefined") return;
  const h = document.documentElement;
  const set = (name: string, on: boolean, value = "on") => {
    if (on) h.setAttribute(`data-a11y-${name}`, value);
    else h.removeAttribute(`data-a11y-${name}`);
  };
  set("font", p.font !== "normal", p.font);
  set("contrast", p.contrast);
  set("dyslexia", p.dyslexia);
  set("spacing", p.spacing);
  set("links", p.links);
  set("focus", p.focus);
  set("motion", p.motion);
  set("calm", p.calm);
  set("cursor", p.cursor);
}

export function saveA11y(p: A11yPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* sem armazenamento: só não lembra */
  }
  applyA11y(p);
}
