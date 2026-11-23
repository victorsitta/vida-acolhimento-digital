import { http } from "./api/client";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await http<{ data: T }>(path, init);
  return r.data;
}
const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

/* ───────── Plano de segurança ───────── */
export interface SafetyContact {
  name: string;
  phone: string;
}
export interface SafetyPlan {
  warningSigns: string;
  coping: string;
  reasons: string;
  safePlace: string;
  contacts: SafetyContact[];
  updatedAt?: string;
}
export const safetyPlanService = {
  async get(): Promise<SafetyPlan | null> {
    const d = await call<any>("/safety-plan");
    if (!d) return null;
    return {
      warningSigns: d.warning_signs ?? "",
      coping: d.coping ?? "",
      reasons: d.reasons ?? "",
      safePlace: d.safe_place ?? "",
      contacts: Array.isArray(d.contacts) ? d.contacts : [],
      updatedAt: d.updated_at,
    };
  },
  async save(plan: SafetyPlan): Promise<void> {
    await call("/safety-plan", json("PUT", plan));
  },
};

/* ───────── Pedido de apoio (supervisor) ───────── */
export interface SupervisorRequest {
  id: string;
  conversationId: string;
  volunteerName: string;
  note?: string;
  urgent: boolean;
  status: string;
  createdAt: string;
}
export const supervisorService = {
  async request(conversationId: string, note?: string, urgent = false): Promise<void> {
    await call("/supervisor/request", json("POST", { conversationId, note, urgent }));
  },
  async list(): Promise<SupervisorRequest[]> {
    const rows = await call<any[]>("/supervisor/requests");
    return rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      volunteerName: r.volunteer?.display_name ?? "Voluntário",
      note: r.note ?? undefined,
      urgent: !!r.urgent,
      status: r.status,
      createdAt: r.created_at,
    }));
  },
  async resolve(id: string): Promise<void> {
    await call(`/supervisor/requests/${id}`, json("PATCH"));
  },
};

/* ───────── Agendamento ───────── */
export interface Appointment {
  id: string;
  startsAt: string;
  topic?: string;
  status: "aberto" | "confirmado" | "cancelado" | "concluido";
  volunteerId?: string;
  volunteerName?: string;
  personName?: string;
}
const mapAppt = (r: any): Appointment => ({
  id: r.id,
  startsAt: r.starts_at,
  topic: r.topic ?? undefined,
  status: r.status,
  volunteerId: r.volunteer_id ?? undefined,
  volunteerName: r.volunteer?.display_name ?? undefined,
  personName: r.person?.user_profiles?.nickname ?? r.person?.display_name ?? undefined,
});
export const appointmentService = {
  async mine(): Promise<Appointment[]> {
    return (await call<any[]>("/appointments/mine")).map(mapAppt);
  },
  async create(startsAt: string, topic?: string): Promise<void> {
    await call("/appointments", json("POST", { startsAt, topic }));
  },
  async cancel(id: string): Promise<void> {
    await call(`/appointments/${id}/cancel`, json("POST"));
  },
  async open(): Promise<Appointment[]> {
    return (await call<any[]>("/appointments/open")).map(mapAppt);
  },
  async claim(id: string): Promise<void> {
    await call(`/appointments/${id}/claim`, json("POST"));
  },
  async complete(id: string): Promise<void> {
    await call(`/appointments/${id}/complete`, json("POST"));
  },
};

/* ───────── Trilhas ───────── */
export interface TrackProgress {
  trackId: string;
  day: number;
}
export const trackService = {
  async progress(): Promise<TrackProgress[]> {
    const rows = await call<any[]>("/tracks/progress");
    return rows.map((r) => ({ trackId: r.track_id, day: Number(r.day) }));
  },
  async complete(trackId: string, day: number): Promise<void> {
    await call(`/tracks/${trackId}/${day}`, json("POST"));
  },
  async undo(trackId: string, day: number): Promise<void> {
    await call(`/tracks/${trackId}/${day}`, json("DELETE"));
  },
};
