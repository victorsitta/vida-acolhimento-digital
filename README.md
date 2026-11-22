# VIDA+ - Plataforma de Acolhimento Emocional Digital

Plataforma humanizada e segura de escuta e acolhimento emocional, com prontuário confidencial, classificação de risco, suporte anônimo e canais comunitários temáticos.

## Arquitetura Unificada (100% Serverless)

- **Frontend:** React 19, TypeScript, Vite 8, TanStack Router, TanStack Query, Tailwind CSS v4 e shadcn/ui.
- **Hospedagem & CDN:** Cloudflare Pages / Workers.
- **Backend & Dados:** Supabase (PostgreSQL, Row Level Security, GoTrue Auth e Supabase Realtime).
- **Prontuário:** Registros de evolução e histórico confidencial (`care_records`) com acesso exclusivo para voluntários e equipe clínica.

## Como Executar Localmente

```bash
npm install
npm run dev
```

Para gerar a build de produção:

```bash
npm run build
```

## Funcionamento

Leia:

- `docs/COMO_FUNCIONA.md`
- `docs/GUIA_INTEGRACAO_BACKEND.md`

## URLs

Configure em `.env.local`:

```env
VITE_API_BASE_URL=http://localhost:3000/api
VITE_APP_URL=http://localhost:5173
```

Para testar frontend local com backend online:

```env
VITE_API_BASE_URL=https://vida-server-9khr.onrender.com/api
VITE_APP_URL=http://localhost:5173
```

No Netlify:

```env
VITE_API_BASE_URL=https://vida-server-9khr.onrender.com/api
VITE_APP_URL=https://vida-acolhimento-digital.netlify.app
```

## Scripts

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Estrutura

```text
src/
  routes/          paginas
  components/      componentes de UI
  layouts/         layouts
  contexts/        estado de perfil/demo
  services/        services usados pelas telas
  services/api/    cliente HTTP configuravel
  mocks/           dados simulados
  types/           tipos TypeScript
```

## Aviso

O VIDA+ oferece acolhimento e escuta emocional, nao diagnostico ou tratamento
medico. Em emergencia: CVV 188 ou SAMU 192.
