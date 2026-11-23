/** Prazos de guarda dos dados. Os mesmos números estão nos padrões da função purge_old_data (SQL). */
export const RETENTION = {
  chatDays: 90, // mensagens de atendimento, depois que a conversa termina
  groupDays: 180, // mensagens de grupos
  logDays: 365, // logs de auditoria
  notificationDays: 90, // avisos do sino
} as const;

export interface DataRow {
  what: string;
  who: string;
  howLong: string;
}

/** O que guardamos, quem pode ver e por quanto tempo. Usado na política e na tela de privacidade. */
export const DATA_POLICY: DataRow[] = [
  { what: "Conta (e-mail, nome e apelido)", who: "Você. O nome e o e-mail reais só a moderação e a administração, quando necessário", howLong: "Enquanto a conta existir. Ao excluir a conta, os dados pessoais são apagados" },
  { what: "Mensagens dos atendimentos", who: "Você e o voluntário. Moderação e administração em caso de denúncia ou risco (fica nos logs)", howLong: `${RETENTION.chatDays} dias depois que a conversa termina, quando são apagadas` },
  { what: "Mensagens dos grupos", who: "Participantes do grupo e a moderação", howLong: `${RETENTION.groupDays} dias` },
  { what: "Prontuário (anotações do voluntário e anexos)", who: "Somente a equipe de atendimento. Você pode pedir acesso", howLong: "Enquanto a conta existir, para dar continuidade ao cuidado" },
  { what: "Check-ins de humor", who: "Somente você", howLong: "Até você apagar ou excluir a conta" },
  { what: "Avaliações e denúncias", who: "Moderação e administração", howLong: "Enquanto a conta existir. Sem o seu nome para quem foi denunciado" },
  { what: "Logs de auditoria (quem fez o quê)", who: "Administração", howLong: `${RETENTION.logDays} dias` },
  { what: "Avisos do sino", who: "Somente você", howLong: `${RETENTION.notificationDays} dias` },
];
