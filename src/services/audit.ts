import { supabase } from "@/lib/supabase";

const recent = new Map<string, number>();

/**
 * Registra uma ação nos logs de auditoria (visíveis ao administrador).
 * Nunca lança erro: o log não pode quebrar a ação da pessoa.
 * `dedupeMs` evita repetir o mesmo registro (ex.: reabrir a mesma conversa).
 */
export async function logAudit(
  action: string,
  entityType: string,
  entityId?: string | null,
  metadata: Record<string, unknown> = {},
  dedupeMs = 0,
): Promise<void> {
  if (!supabase) return;
  try {
    if (dedupeMs > 0) {
      const key = `${action}:${entityId ?? ""}`;
      const last = recent.get(key) ?? 0;
      if (Date.now() - last < dedupeMs) return;
      recent.set(key, Date.now());
    }
    const { data } = await supabase.auth.getSession();
    await supabase.from("audit_logs").insert({
      actor_id: data.session?.user?.id ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      metadata_json: metadata,
    });
  } catch {
    // silencioso
  }
}
