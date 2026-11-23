export interface TrackDay {
  title: string;
  text: string;
  action: string;
}
export interface Track {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  tone: string;
  days: TrackDay[];
}

/** Programas curtos de 7 dias: um pequeno exercício por dia. Conteúdo de apoio, não é tratamento. */
export const TRACKS: Track[] = [
  {
    id: "sono",
    title: "7 dias para dormir melhor",
    subtitle: "Pequenos hábitos para noites mais tranquilas",
    emoji: "🌙",
    tone: "from-info/25 to-info/5",
    days: [
      { title: "Horário de acordar", text: "O sono começa pela manhã. Acordar sempre no mesmo horário regula o relógio do corpo.", action: "Escolha um horário de acordar e coloque o alarme. Mantenha por toda a semana." },
      { title: "Menos telas à noite", text: "A luz azul das telas atrasa a sonolência.", action: "Desligue celular e TV 30 minutos antes de deitar. Deixe o aparelho longe da cama." },
      { title: "Despeje a mente", text: "Pensamentos soltos mantêm o cérebro acordado.", action: "Escreva por 5 minutos tudo o que está na sua cabeça e o que fará amanhã." },
      { title: "Respiração 4-7-8", text: "Respirar devagar avisa ao corpo que é seguro descansar.", action: "Na cama: inspire 4s, segure 7s, solte em 8s. Repita 4 vezes." },
      { title: "Ambiente do sono", text: "Escuro, silêncio e temperatura amena ajudam.", action: "Ajuste o quarto: cortinas fechadas, pouca luz, ar fresco." },
      { title: "Cuidado com estimulantes", text: "Café e energéticos ficam no corpo por horas.", action: "Evite cafeína depois das 16h e refeições pesadas à noite." },
      { title: "Seu ritual", text: "Rituais repetidos viram sinal de sono.", action: "Monte 3 passos fixos antes de dormir (ex.: banho, chá, leitura leve) e repita." },
    ],
  },
  {
    id: "ansiedade",
    title: "7 passos para a ansiedade",
    subtitle: "Ferramentas simples para acalmar a mente",
    emoji: "🌿",
    tone: "from-success/25 to-success/5",
    days: [
      { title: "Perceber o corpo", text: "A ansiedade aparece primeiro no corpo.", action: "Pare 2 minutos e note onde sente tensão (peito, ombros, barriga). Só observe." },
      { title: "Respiração 4-4-6", text: "Soltar o ar mais devagar acalma o sistema nervoso.", action: "Faça 5 ciclos da respiração guiada do app." },
      { title: "Técnica 5-4-3-2-1", text: "Trazer os sentidos para o presente interrompe o ciclo de preocupação.", action: "Nomeie 5 coisas que vê, 4 que toca, 3 que ouve, 2 que cheira, 1 que saboreia." },
      { title: "Nomear o pensamento", text: "Dar nome ao pensamento tira parte do poder dele.", action: "Quando vier uma preocupação, diga: “estou tendo o pensamento de que…”." },
      { title: "Mover o corpo", text: "Movimento gasta a adrenalina da ansiedade.", action: "Caminhe 15 minutos ou faça alongamentos." },
      { title: "Hora da preocupação", text: "Reservar um momento evita que a preocupação tome o dia.", action: "Escolha 10 minutos para anotar preocupações. Fora dele, adie." },
      { title: "Peça apoio", text: "Dividir alivia.", action: "Conte a alguém de confiança como está. Se quiser, converse com um voluntário." },
    ],
  },
  {
    id: "gratidao",
    title: "7 dias de gratidão",
    subtitle: "Treine o olhar para o que está bom",
    emoji: "🌻",
    tone: "from-primary/25 to-primary/5",
    days: [
      { title: "Três coisas boas", text: "Notar o bom é um músculo que se treina.", action: "Anote 3 coisas boas de hoje, por menores que sejam." },
      { title: "Uma pessoa", text: "Reconhecer alguém fortalece vínculos.", action: "Mande uma mensagem de agradecimento a alguém." },
      { title: "Seu corpo", text: "Ele cuida de você todos os dias.", action: "Agradeça a algo no seu corpo que funciona bem." },
      { title: "Um prazer simples", text: "Pequenos prazeres contam.", action: "Saboreie algo com atenção total (um café, uma fruta, uma música)." },
      { title: "Um desafio superado", text: "Você já passou por coisas difíceis.", action: "Lembre de algo difícil que você superou e o que aprendeu." },
      { title: "Um gesto de gentileza", text: "Ajudar também faz bem a quem ajuda.", action: "Faça algo gentil por alguém, sem esperar nada." },
      { title: "Carta para você", text: "Fechar o ciclo com autocompaixão.", action: "Escreva 3 frases gentis para você mesmo(a) como falaria a um amigo." },
    ],
  },
  {
    id: "autoestima",
    title: "7 dias de autocuidado",
    subtitle: "Voltar a olhar por você",
    emoji: "💛",
    tone: "from-accent/25 to-accent/5",
    days: [
      { title: "Falar com gentileza", text: "A voz interna molda como nos sentimos.", action: "Perceba uma crítica sua e reescreva como diria a um amigo querido." },
      { title: "Necessidades básicas", text: "Água, comida e descanso vêm primeiro.", action: "Beba água, faça uma refeição com calma e descanse 10 minutos." },
      { title: "Um limite", text: "Dizer não também é cuidado.", action: "Diga não a algo que você não quer ou não pode assumir hoje." },
      { title: "Algo que você gosta", text: "Prazer não é luxo.", action: "Dedique 20 minutos a algo que gosta, sem culpa." },
      { title: "Suas qualidades", text: "Lembrar do que você tem de bom reequilibra a visão.", action: "Liste 5 qualidades suas. Peça a alguém para dizer uma." },
      { title: "Menos comparação", text: "Comparar-se nas redes costuma doer.", action: "Silencie por hoje perfis que fazem você se sentir mal." },
      { title: "Uma meta pequena", text: "Conquistas pequenas reconstroem a confiança.", action: "Escolha uma meta minúscula para a próxima semana e conte a alguém." },
    ],
  },
];
