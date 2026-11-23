import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { HeartHandshake, MessagesSquare, Smile, UsersRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { CountUp } from "@/components/common/StatCard";

export interface PublicStatsData {
  online: number;
  volunteers: number;
  conversations: number;
  groups: number;
  rating: number;
}

/** Números reais e públicos da plataforma (função pública no Supabase, sem dados pessoais). */
export function usePublicStats() {
  return useQuery({
    queryKey: ["public-stats"],
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<PublicStatsData | null> => {
      if (!supabase) return null;
      const { data, error } = await supabase.rpc("public_stats");
      if (error || !data) return null;
      return {
        online: Number(data.online ?? 0),
        volunteers: Number(data.volunteers ?? 0),
        conversations: Number(data.conversations ?? 0),
        groups: Number(data.groups ?? 0),
        rating: Number(data.rating ?? 0),
      };
    },
  });
}

/** Faixa de números reais. Só aparece se já houver algum dado de verdade. */
export function PublicStats() {
  const { data } = usePublicStats();
  if (!data || data.volunteers + data.conversations + data.groups === 0) return null;

  const items = [
    { icon: HeartHandshake, label: "Voluntários", value: String(data.volunteers) },
    { icon: MessagesSquare, label: "Atendimentos realizados", value: String(data.conversations) },
    { icon: UsersRound, label: "Grupos de apoio", value: String(data.groups) },
    {
      icon: Smile,
      label: "Nota média dos atendimentos",
      value: data.rating > 0 ? data.rating.toFixed(1).replace(".", ",") : "—",
    },
  ];

  return (
    <section className="relative -mt-6 pb-6">
      <div className="mx-auto max-w-5xl px-6">
        <motion.ul
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-2 gap-3 rounded-3xl border bg-card/80 p-3 shadow-soft backdrop-blur sm:grid-cols-4"
        >
          {items.map(({ icon: Icon, label, value }) => (
            <li key={label} className="flex items-center gap-3 rounded-2xl p-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-lg font-semibold tabular-nums leading-none">
                  <CountUp value={value} />
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{label}</span>
              </span>
            </li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
