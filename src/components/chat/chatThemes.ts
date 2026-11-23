import { createContext } from "react";

export interface ChatTheme {
  id: string;
  label: string;
  from: string;
  to: string;
  fg: string;
}

/** Cores de mensagem que cada pessoa pode escolher. "ouro" usa a cor padrão do site. */
export const THEMES: ChatTheme[] = [
  { id: "ouro", label: "Dourado", from: "", to: "", fg: "" },
  { id: "oceano", label: "Oceano", from: "oklch(0.58 0.12 240)", to: "oklch(0.5 0.12 255)", fg: "white" },
  { id: "floresta", label: "Floresta", from: "oklch(0.56 0.11 155)", to: "oklch(0.48 0.1 170)", fg: "white" },
  { id: "rosa", label: "Rosa", from: "oklch(0.64 0.14 5)", to: "oklch(0.56 0.14 350)", fg: "white" },
  { id: "lavanda", label: "Lavanda", from: "oklch(0.6 0.13 295)", to: "oklch(0.52 0.14 280)", fg: "white" },
];

export const themeById = (id?: string | null) => THEMES.find((t) => t.id === id);

/** Cor escolhida pela outra pessoa da conversa (aparece nas mensagens dela). */
export const ChatThemeContext = createContext<{ other?: ChatTheme }>({});
