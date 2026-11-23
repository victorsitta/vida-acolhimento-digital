/**
 * Sinais de risco no texto (suicídio, autolesão). Serve só para AJUDAR: mostrar apoio
 * a quem escreve e alertar o voluntário. Nunca bloqueia a mensagem nem faz diagnóstico.
 */
const RISK_PATTERNS: RegExp[] = [
  /\b(quero|vou|queria|penso em|pensando em|tenho vontade de|vontade de)\s+(me\s+)?(matar|morrer|suicidar|sumir|desaparecer)/,
  /\bme\s+matar\b/,
  /\bsuic[ií]d/,
  /\b(n[aã]o\s+(quero|aguento|consigo)\s+(mais\s+)?(viver|continuar|seguir|existir))/,
  /\bacabar\s+com\s+(tudo|minha\s+vida|a\s+minha\s+vida)\b/,
  /\bacabar\s+com\s+(a\s+)?(minha\s+)?vida\b/,
  /\b(melhor|seria melhor)\s+(sem\s+mim|eu\s+morrer|se\s+eu\s+morresse)/,
  /\bn[aã]o\s+(vale|valho)\s+(a\s+pena|nada)\b/,
  /\bme\s+(machucar|cortar|ferir)\b/,
  /\b(automutila|autolesa|me\s+corto)/,
  /\boverdose\b/,
  /\btomar\s+(todos\s+os\s+)?(rem[eé]dios|comprimidos|pilulas|p[ií]lulas)\b/,
  /\b(enforcar|me\s+jogar\s+(de|da|do))\b/,
  /\bdespedida\b.*\b(todos|vida)\b/,
];

function normalize(text: string) {
  return text.toLowerCase().normalize("NFC");
}

/** true se o texto tem sinais claros de risco. */
export function detectRisk(text: string): boolean {
  if (!text || text.length < 6) return false;
  const t = normalize(text);
  return RISK_PATTERNS.some((re) => re.test(t));
}
