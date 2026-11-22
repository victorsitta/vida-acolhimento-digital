# VIDA+ — Arquitetura Unificada Frontend (Cloudflare Pages) + Supabase

Este documento sintetiza a arquitetura final consolidada do VIDA+, após a eliminação da dependência de servidores dedicados (Render) e a migração completa para infraestrutura Serverless e em Tempo Real no Supabase e Cloudflare.

---

## 1. Topologia da Solução

* **Frontend:** Hospedado no **Cloudflare Pages** (SPA com TanStack Router + Vite 8 + React 19).
* **Banco de Dados & Autenticação:** **Supabase** (PostgreSQL com RLS + GoTrue Auth).
* **Tempo Real (Chat, Fila, Presença):** **Supabase Realtime** nativo (WebSockets com canais, Presence e Broadcast).
* **Prontuário do Acolhido:** Tabela `care_records` com RLS restrito a voluntários e moderadores.
* **Custo Operacional:** **R$ 0,00** (dentro dos planos gratuitos de ambas as plataformas).
* **Cold Start / Latência:** Zero cold start (sem servidor dormindo).

---

## 2. Como Configurar o Deploy no Cloudflare Pages

1. Conecte o repositório `vida-acolhimento-digital` no painel do **Cloudflare Pages**.
2. Defina os parâmetros de Build:
   * **Framework Preset:** `Vite`
   * **Build Command:** `npm run build`
   * **Build Output Directory:** `dist`
   * **Root Directory:** `/` (ou `vida-acolhimento-digital`)
3. Adicione as seguintes **Variáveis de Ambiente** no Cloudflare Pages:
   * `NODE_VERSION`: `20.18.0`
   * `VITE_SUPABASE_URL`: `https://vmqzjgmbjvsrpfqigtso.supabase.co`
   * `VITE_SUPABASE_ANON_KEY`: `(sua chave pública anon do Supabase)`
   * `VITE_APP_URL`: `https://seu-projeto.pages.dev`
4. O arquivo `public/_redirects` já está configurado para permitir navegação SPA em todas as rotas (`/* /index.html 200`).

---

## 3. Como Rodar o Banco de Dados no Supabase

O arquivo consolidado com todas as tabelas, índices, enums, triggers e RPCs encontra-se em:

```text
supabase/schema_completo.sql
```

Para aplicar no seu projeto Supabase:
1. Acesse o painel do Supabase (`https://app.supabase.com`).
2. Vá em **SQL Editor**.
3. Copie todo o conteúdo de `supabase/schema_completo.sql` e clique em **Run**.
4. O script é 100% idempotente e criará:
   * As tabelas de usuários, perfis, candidaturas e conversas.
   * O módulo de **Prontuário do Acolhido** (`care_records`).
   * As funções RPC seguras para fila (`join_support_queue`), aceite (`accept_support_conversation`) e fechamento (`close_support_conversation`).
   * A habilitação das tabelas no **Supabase Realtime**.

---

## 4. Recursos de Destaque

1. **Ficha / Prontuário do Acolhido:** No chat do voluntário (`vol.chat.$id.tsx`), o botão "Prontuário" abre a gaveta confidencial (`CareRecordSheet.tsx`) permitindo consultar o histórico de todas as passagens daquele paciente pela plataforma e adicionar notas de evolução.
2. **Anonimato com Rastreabilidade Ética:** O usuário pode ser anônimo perante a internet, mas o sistema preserva seu UUID e histórico prévio de cuidados para dar continuidade aos atendimentos.
3. **Presença em Tempo Real:** Conexão instantânea via canais do Supabase Realtime sem sobrecarga de memória em servidores.
