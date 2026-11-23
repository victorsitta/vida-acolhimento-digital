-- =============================================================================
-- DADOS DE EXEMPLO PARA O VIDA+ (rode no SQL Editor do Supabase)
--
-- Pre-requisitos:
--   1) As 4 contas de teste existem (teste.usuario / teste.voluntario /
--      teste.moderador / teste.administrador @vidamais.app).
--   2) O RODAR_TUDO.sql ja foi executado (colunas novas, anexos, logs...).
--
-- O que cria: grupos com conversas, 2 atendimentos encerrados com mensagens,
-- prontuarios, sinalizacao de risco, avaliacoes, denuncias, candidaturas,
-- relatorios de voluntario, notificacoes e logs de auditoria.
--
-- E seguro rodar de novo: se os dados ja foram criados, nada e duplicado.
-- Para recriar do zero, apague os dados de exemplo (ver LIMPEZA no final).
-- =============================================================================

DO $$
DECLARE
  u_user UUID; u_vol UUID; u_mod UUID; u_adm UUID;
  g1 UUID; g2 UUID; g3 UUID;
  conv1 UUID; conv2 UUID;
  base TIMESTAMPTZ;
BEGIN
  IF EXISTS (SELECT 1 FROM public.audit_logs WHERE action = 'seed.demo') THEN
    RAISE NOTICE 'Dados de exemplo ja existem. Nada foi alterado.';
    RETURN;
  END IF;

  SELECT id INTO u_user FROM auth.users WHERE email = 'teste.usuario@vidamais.app';
  SELECT id INTO u_vol  FROM auth.users WHERE email = 'teste.voluntario@vidamais.app';
  SELECT id INTO u_mod  FROM auth.users WHERE email = 'teste.moderador@vidamais.app';
  SELECT id INTO u_adm  FROM auth.users WHERE email = 'teste.administrador@vidamais.app';
  IF u_user IS NULL OR u_vol IS NULL OR u_mod IS NULL OR u_adm IS NULL THEN
    RAISE EXCEPTION 'Crie as 4 contas de teste antes de rodar este arquivo.';
  END IF;

  -- papeis das contas de teste
  UPDATE public.users SET role = 'voluntario'    WHERE id = u_vol;
  UPDATE public.users SET role = 'moderador'     WHERE id = u_mod;
  UPDATE public.users SET role = 'administrador' WHERE id = u_adm;
  INSERT INTO public.volunteer_profiles (user_id, availability_status)
  SELECT x, 'offline' FROM unnest(ARRAY[u_vol, u_mod, u_adm]) AS x
  ON CONFLICT DO NOTHING;

  -- apelidos publicos mais amigaveis
  UPDATE public.user_profiles SET nickname = 'Girassol'  WHERE user_id = u_user;
  UPDATE public.user_profiles SET nickname = 'Voluntaria Aurora' WHERE user_id = u_vol;

  -- ================= GRUPOS =================
  INSERT INTO public.communities (name, description, rules_json)
  SELECT n, d, r::jsonb FROM (VALUES
    ('Conversas leves', 'Um espaço para conversar sobre o dia e encontrar companhia.',
      '["Respeite o tempo de cada pessoa","Não compartilhe dados pessoais","Sem diagnósticos ou prescrições"]'),
    ('Ansiedade e rotina', 'Trocas acolhedoras sobre ansiedade, hábitos e pequenos passos.',
      '["Fale a partir da própria experiência","Evite gatilhos explícitos","Procure ajuda profissional quando necessário"]'),
    ('Luto e saudade', 'Um grupo cuidadoso para quem está atravessando perdas.',
      '["Acolha sem comparar dores","Não pressione ninguém a responder","Use aviso antes de conteúdo sensível"]'),
    ('Trabalho e esgotamento', 'Cansaço, pressão e limites no trabalho e nos estudos.',
      '["Sem críticas a pessoas ou empresas","Compartilhe estratégias que ajudaram você","Respeite o anonimato"]'),
    ('Sono e descanso', 'Dicas e desabafos sobre noites difíceis e rotina de descanso.',
      '["Sem indicação de medicamentos","Respeite os horários de silêncio de cada um","Acolha sem julgar"]')
  ) AS v(n, d, r)
  WHERE NOT EXISTS (SELECT 1 FROM public.communities c WHERE c.name = v.n);

  SELECT id INTO g1 FROM public.communities WHERE name = 'Conversas leves' LIMIT 1;
  SELECT id INTO g2 FROM public.communities WHERE name = 'Ansiedade e rotina' LIMIT 1;
  SELECT id INTO g3 FROM public.communities WHERE name = 'Luto e saudade' LIMIT 1;

  INSERT INTO public.community_members (community_id, user_id, alias, status) VALUES
    (g1, u_user, 'Girassol', 'ativo'),
    (g1, u_vol,  'Aurora',   'ativo'),
    (g2, u_user, 'Girassol', 'ativo'),
    (g2, u_vol,  'Aurora',   'ativo'),
    (g3, u_user, 'Girassol', 'ativo')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.community_messages (community_id, sender_id, alias_snapshot, body, body_encrypted, created_at)
  SELECT g1, CASE who WHEN 'u' THEN u_user ELSE u_vol END,
         CASE who WHEN 'u' THEN 'Girassol' ELSE 'Aurora' END, txt, txt,
         now() - (mins || ' minutes')::interval
  FROM (VALUES
    (190, 'v', 'Bom dia, pessoal! Como foi a manhã de vocês?'),
    (185, 'u', 'Bom dia! Acordei cansada, mas tomei um café e já melhorei um pouco.'),
    (180, 'v', 'Que bom que você se cuidou. Um passo de cada vez já conta.'),
    (170, 'u', 'Hoje consegui caminhar 15 minutos. Pequeno, mas me deixou mais leve.'),
    (160, 'v', 'Isso é lindo! Caminhar ajuda muito a organizar os pensamentos.')
  ) AS m(mins, who, txt);

  INSERT INTO public.community_messages (community_id, sender_id, alias_snapshot, body, body_encrypted, created_at)
  SELECT g2, CASE who WHEN 'u' THEN u_user ELSE u_vol END,
         CASE who WHEN 'u' THEN 'Girassol' ELSE 'Aurora' END, txt, txt,
         now() - (mins || ' minutes')::interval
  FROM (VALUES
    (300, 'u', 'Alguém tem uma técnica de respiração que ajuda antes de reuniões?'),
    (290, 'v', 'A respiração 4-4-6: inspira por 4, segura por 4 e solta por 6. Repita 5 vezes.'),
    (280, 'u', 'Vou testar hoje. Obrigada por compartilhar!')
  ) AS m(mins, who, txt);

  -- ================= ATENDIMENTO 1 (encerrado pelo usuario) =================
  base := now() - interval '3 days';
  INSERT INTO public.conversations
    (user_id, volunteer_id, status, priority, started_at, ended_at, closed_reason, rating, rating_comment, created_at, updated_at)
  VALUES
    (u_user, u_vol, 'encerrada', 'normal', base + interval '2 minutes', base + interval '41 minutes',
     'usuario_encerrou', 5, 'Me senti ouvida, obrigada.', base, base + interval '41 minutes')
  RETURNING id INTO conv1;

  INSERT INTO public.messages (conversation_id, sender_id, body, body_encrypted, created_at)
  SELECT conv1, CASE who WHEN 'u' THEN u_user ELSE u_vol END, txt, txt, base + (mins || ' minutes')::interval
  FROM (VALUES
    (3,  'v', 'Oi, tudo bem? Eu sou a Aurora. Fico feliz que você tenha vindo. Como você está hoje?'),
    (5,  'u', 'Oi. Estou muito ansiosa com o trabalho. Sinto que não vou dar conta de tudo.'),
    (7,  'v', 'Entendo. Deve ser pesado carregar isso. Quer me contar o que mais te preocupa agora?'),
    (11, 'u', 'Tenho três entregas essa semana e não consigo dormir direito.'),
    (14, 'v', 'Obrigada por confiar em mim. Dormir mal piora tudo mesmo. Vamos pensar em um passo pequeno para hoje?'),
    (20, 'u', 'Talvez separar o que é urgente do que pode esperar.'),
    (23, 'v', 'Ótima ideia. Você pode listar as três entregas e escolher só uma para começar.'),
    (31, 'u', 'Fiz a lista. Só uma é realmente para amanhã. Já me sinto menos apertada.'),
    (36, 'v', 'Que bom! Lembre que você pode voltar aqui sempre que precisar.'),
    (40, 'u', 'Obrigada, de verdade. Vou tentar descansar.')
  ) AS m(mins, who, txt);

  INSERT INTO public.care_records (user_id, volunteer_id, conversation_id, risk_level, title, summary, action_taken, created_at)
  VALUES (u_user, u_vol, conv1, 'medio', 'Primeira escuta: ansiedade no trabalho',
    'Pessoa relatou ansiedade intensa por sobrecarga de trabalho (3 entregas na semana) e sono prejudicado. Sem ideação de risco. Demonstrou boa resposta ao reorganizar prioridades. Encerrou mais calma e agradecida.',
    'Escuta ativa, técnica de listar e priorizar tarefas, orientação sobre higiene do sono. Convidada a retornar se necessário.',
    base + interval '42 minutes');

  -- ================= ATENDIMENTO 2 (encerrado pela voluntaria) =================
  base := now() - interval '1 day';
  INSERT INTO public.conversations
    (user_id, volunteer_id, status, priority, started_at, ended_at, closed_reason, rating, created_at, updated_at)
  VALUES
    (u_user, u_vol, 'encerrada', 'prioritaria', base + interval '1 minute', base + interval '28 minutes',
     'voluntario_encerrou', 4, base, base + interval '28 minutes')
  RETURNING id INTO conv2;

  INSERT INTO public.messages (conversation_id, sender_id, body, body_encrypted, created_at)
  SELECT conv2, CASE who WHEN 'u' THEN u_user ELSE u_vol END, txt, txt, base + (mins || ' minutes')::interval
  FROM (VALUES
    (2,  'v', 'Oi de novo! Que bom te ver por aqui. Como foi a semana depois da nossa conversa?'),
    (4,  'u', 'Melhorou um pouco, mas hoje tive um dia bem difícil e me senti sozinha.'),
    (6,  'v', 'Sinto muito que o dia foi pesado. Quer me contar o que aconteceu?'),
    (12, 'u', 'Briguei com uma amiga e fiquei pensando que ninguém se importa comigo.'),
    (15, 'v', 'Essa dor faz sentido. Você disse que ninguém se importa. Isso é um pensamento ou algo mais forte, como vontade de se machucar?'),
    (18, 'u', 'Não, só tristeza mesmo. Eu jamais me machucaria.'),
    (21, 'v', 'Obrigada por me dizer. Estou aqui. Que tal escrever uma mensagem sincera para essa amiga, sem enviar ainda?'),
    (27, 'u', 'Vou fazer isso. Obrigada por me ouvir.')
  ) AS m(mins, who, txt);

  INSERT INTO public.risk_flags (conversation_id, created_by, level, reason, action_taken, created_at)
  VALUES (conv2, u_vol, 'baixo', 'Tristeza após conflito com amiga; verifiquei ausência de ideação. Acompanhar no próximo contato.',
          'Perguntei diretamente sobre risco; resposta negativa. Reforcei rede de apoio.', base + interval '19 minutes');

  INSERT INTO public.care_records (user_id, volunteer_id, conversation_id, risk_level, title, summary, action_taken, created_at)
  VALUES (u_user, u_vol, conv2, 'baixo', 'Retorno: tristeza e conflito com amiga',
    'Segundo contato. Relatou melhora na ansiedade, mas episódio de tristeza após discussão com amiga. Negou ideação autolesiva. Sensação de solidão pontual.',
    'Escuta ativa, validação da emoção, sugestão de escrever uma carta sem enviar. Combinado de retorno caso a tristeza persista.',
    base + interval '30 minutes');

  -- ================= DENUNCIAS =================
  INSERT INTO public.reports (reporter_id, target_type, target_id, reported_alias, reason, description, status, decision, created_at) VALUES
    (u_user, 'mensagem', NULL, 'Participante anônimo', 'Mensagem inadequada no grupo',
      'Uma pessoa usou linguagem agressiva com outro participante em Conversas leves.', 'pendente', NULL, now() - interval '5 hours'),
    (u_user, 'usuario', NULL, 'PerfilSuspeito', 'Divulgação de dados pessoais',
      'Pediu telefone e endereço de outros participantes.', 'em_analise', NULL, now() - interval '2 days'),
    (u_vol,  'usuario', NULL, 'Visitante123', 'Comportamento abusivo no atendimento',
      'Ofendeu a voluntária durante a conversa e foi orientado a respeitar as regras.', 'resolvido',
      'Usuário advertido. Reincidência resultará em suspensão.', now() - interval '4 days');

  -- ================= CANDIDATURAS =================
  INSERT INTO public.volunteer_applications (user_id, kind, status, motivation, experience, created_at) VALUES
    (u_user, 'voluntario', 'pendente',
      'Fui acolhida por voluntários e quero retribuir ouvindo outras pessoas.',
      'Participo de grupos de apoio há 1 ano. Disponibilidade: noites e fins de semana.', now() - interval '6 hours'),
    (u_vol, 'moderador', 'pendente',
      'Atendo há meses e gostaria de ajudar a manter os grupos seguros e acolhedores.',
      'Mais de 40 atendimentos concluídos, sem ocorrências. Disponibilidade: tardes.', now() - interval '1 day');

  -- ================= RELATORIOS DE VOLUNTARIOS =================
  INSERT INTO public.volunteer_reports (volunteer_id, target_user_id, conversation_id, title, description, status, admin_feedback, created_at) VALUES
    (u_vol, u_user, conv2, 'Atenção a sinais de isolamento',
      'Pessoa relatou solidão pontual após conflito. Sem risco no momento, mas sugiro acompanhamento próximo nos próximos atendimentos.',
      'pendente', NULL, now() - interval '20 hours'),
    (u_vol, u_user, conv1, 'Dificuldade técnica durante o atendimento',
      'A conexão caiu duas vezes no meio da conversa. Consegui retomar e concluir o atendimento.',
      'respondido', 'Obrigado pelo aviso. Estamos acompanhando a estabilidade da plataforma.', now() - interval '3 days');

  -- ================= NOTIFICACOES =================
  INSERT INTO public.notifications (user_id, type, title, body, status, sent_at) VALUES
    (u_user, 'sistema', 'Bem-vinda ao VIDA+', 'Você pode conversar com um voluntário a qualquer momento ou participar dos grupos de apoio.', 'lida', now() - interval '3 days'),
    (u_user, 'atendimento', 'Avalie seu último atendimento', 'Sua opinião ajuda a melhorar o acolhimento.', 'nao_lida', now() - interval '1 day');

  -- ================= LOGS DE AUDITORIA =================
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata_json, created_at) VALUES
    (u_user, 'login',                   'sessao',      NULL,        '{"origem":"exemplo"}', now() - interval '3 days 1 hour'),
    (u_user, 'fila.entrada',            'atendimento', conv1::text, '{"origem":"exemplo"}', now() - interval '3 days'),
    (u_vol,  'atendimento.aceito',      'atendimento', conv1::text, '{"origem":"exemplo"}', now() - interval '3 days' + interval '2 minutes'),
    (u_user, 'atendimento.encerrado',   'atendimento', conv1::text, '{"reason":"usuario_encerrou"}', now() - interval '3 days' + interval '41 minutes'),
    (u_vol,  'prontuario.criado',       'prontuario',  NULL,        '{"risco":"medio","anexos":0}', now() - interval '3 days' + interval '42 minutes'),
    (u_user, 'atendimento.avaliado',    'atendimento', conv1::text, '{"origem":"exemplo"}', now() - interval '3 days' + interval '50 minutes'),
    (u_user, 'login',                   'sessao',      NULL,        '{"origem":"exemplo"}', now() - interval '1 day 1 hour'),
    (u_vol,  'atendimento.aceito',      'atendimento', conv2::text, '{"origem":"exemplo"}', now() - interval '1 day' + interval '1 minute'),
    (u_vol,  'risco.sinalizado',        'atendimento', conv2::text, '{"level":"baixo"}', now() - interval '1 day' + interval '19 minutes'),
    (u_vol,  'atendimento.encerrado',   'atendimento', conv2::text, '{"reason":"voluntario_encerrou"}', now() - interval '1 day' + interval '28 minutes'),
    (u_user, 'denuncia.criada',         'denuncia',    NULL,        '{"reason":"Mensagem inadequada no grupo"}', now() - interval '5 hours'),
    (u_user, 'candidatura.enviada',     'candidatura', NULL,        '{"tipo":"voluntario"}', now() - interval '6 hours'),
    (u_vol,  'candidatura.enviada',     'candidatura', NULL,        '{"tipo":"moderador"}', now() - interval '1 day'),
    (u_adm,  'usuario.papel_alterado',  'usuario',     u_vol::text, '{"role":"voluntario"}', now() - interval '4 days'),
    (u_mod,  'denuncia.atualizada',     'denuncia',    NULL,        '{"status":"resolvido"}', now() - interval '3 days 20 hours');

  -- marcador: impede duplicar se rodar de novo
  INSERT INTO public.audit_logs (actor_id, action, entity_type, metadata_json)
  VALUES (u_adm, 'seed.demo', 'sistema', '{"descricao":"Dados de exemplo criados"}');

  RAISE NOTICE 'Dados de exemplo criados com sucesso.';
END $$;

-- =============================================================================
-- LIMPEZA (opcional) — para remover os dados de exemplo, rode separadamente:
--
-- DELETE FROM public.audit_logs WHERE metadata_json->>'origem' = 'exemplo' OR action = 'seed.demo';
-- DELETE FROM public.notifications WHERE title IN ('Bem-vinda ao VIDA+','Avalie seu último atendimento');
-- DELETE FROM public.volunteer_reports WHERE title IN ('Atenção a sinais de isolamento','Dificuldade técnica durante o atendimento');
-- DELETE FROM public.volunteer_applications WHERE motivation LIKE 'Fui acolhida por voluntários%' OR motivation LIKE 'Atendo há meses%';
-- DELETE FROM public.reports WHERE reason IN ('Mensagem inadequada no grupo','Divulgação de dados pessoais','Comportamento abusivo no atendimento');
-- DELETE FROM public.conversations WHERE closed_reason IN ('usuario_encerrou','voluntario_encerrou')
--   AND user_id IN (SELECT id FROM auth.users WHERE email = 'teste.usuario@vidamais.app');
-- =============================================================================
