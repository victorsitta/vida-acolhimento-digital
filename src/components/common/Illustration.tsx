import { cn } from "@/lib/utils";

type Kind = "chat" | "calm" | "search" | "lost" | "oops";

/**
 * Ilustrações próprias (SVG), no estilo do site: formas macias, folhas e corações.
 * Usam as cores do tema, então funcionam no modo claro e no escuro.
 */
export function Illustration({ kind = "calm", className }: { kind?: Kind; className?: string }) {
  return (
    <svg viewBox="0 0 200 160" className={cn("h-36 w-auto", className)} role="img" aria-hidden="true">
      <defs>
        <linearGradient id={`g-${kind}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.85" />
        </linearGradient>
      </defs>

      {/* base suave */}
      <ellipse cx="100" cy="138" rx="62" ry="9" fill="var(--foreground)" opacity="0.07" />
      <circle cx="100" cy="76" r="58" fill="var(--primary)" opacity="0.12" />
      <circle cx="152" cy="40" r="9" fill="var(--accent)" opacity="0.35" />
      <circle cx="44" cy="52" r="6" fill="var(--primary)" opacity="0.4" />

      {kind === "chat" && (
        <g>
          <path d="M52 52a14 14 0 0 1 14-14h58a14 14 0 0 1 14 14v28a14 14 0 0 1-14 14H88l-20 16v-16h-2a14 14 0 0 1-14-14z" fill={`url(#g-${kind})`} />
          <circle cx="78" cy="66" r="4.5" fill="var(--primary-foreground)" />
          <circle cx="96" cy="66" r="4.5" fill="var(--primary-foreground)" />
          <circle cx="114" cy="66" r="4.5" fill="var(--primary-foreground)" />
          <path d="M126 96h22a12 12 0 0 1 12 12v10a12 12 0 0 1-12 12h-2v12l-14-12h-6a12 12 0 0 1-12-12v-10a12 12 0 0 1 12-12z" fill="var(--card)" stroke="var(--border)" strokeWidth="2" transform="translate(-6 -8)" />
        </g>
      )}

      {kind === "calm" && (
        <g>
          <path d="M100 118c-30-14-40-34-40-52 0-14 10-24 22-24 10 0 15 6 18 12 3-6 8-12 18-12 12 0 22 10 22 24 0 18-10 38-40 52z" fill={`url(#g-${kind})`} />
          <path d="M100 118c0-26 14-44 40-52M100 118c0-22-12-36-34-44" stroke="var(--background)" strokeWidth="2" strokeLinecap="round" opacity="0.5" fill="none" />
          <path d="M148 118c0-10 6-18 16-20-1 10-6 18-16 20z" fill="var(--success)" opacity="0.8" />
          <path d="M42 120c0-10-6-16-14-18 1 9 5 16 14 18z" fill="var(--success)" opacity="0.7" />
        </g>
      )}

      {kind === "search" && (
        <g>
          <circle cx="92" cy="70" r="30" fill="var(--card)" stroke={`url(#g-${kind})`} strokeWidth="9" />
          <path d="M115 93l26 26" stroke={`url(#g-${kind})`} strokeWidth="11" strokeLinecap="round" />
          <path d="M80 70a12 12 0 0 1 12-12" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.6" />
        </g>
      )}

      {kind === "lost" && (
        <g>
          <rect x="54" y="46" width="92" height="64" rx="14" fill="var(--card)" stroke="var(--border)" strokeWidth="2.5" />
          <rect x="54" y="46" width="92" height="16" rx="8" fill={`url(#g-${kind})`} />
          <circle cx="64" cy="54" r="2.5" fill="var(--primary-foreground)" />
          <circle cx="73" cy="54" r="2.5" fill="var(--primary-foreground)" />
          <path d="M82 94c4-8 12-8 16 0M104 94c4-8 12-8 16 0" stroke="var(--muted-foreground)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <path d="M92 84h16" stroke="var(--muted-foreground)" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
          <path d="M40 124c14-8 26 8 40 0s26 8 40 0 26 8 40 0" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.5" />
        </g>
      )}

      {kind === "oops" && (
        <g>
          <path d="M100 38l48 82H52z" fill="var(--card)" stroke={`url(#g-${kind})`} strokeWidth="8" strokeLinejoin="round" />
          <path d="M100 66v28" stroke="var(--primary)" strokeWidth="7" strokeLinecap="round" />
          <circle cx="100" cy="108" r="4.5" fill="var(--primary)" />
        </g>
      )}
    </svg>
  );
}
