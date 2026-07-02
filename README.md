# Bolão da Família — Copa do Mundo ⚽

App com Next.js + Supabase + Vercel. Placar dos jogos do Brasil atualiza sozinho,
palpites não podem ser editados/apagados, e tudo atualiza em tempo real pra
quem estiver com a tela aberta.

## 1. Crie o projeto no Supabase

1. Vá em [supabase.com](https://supabase.com) → **New project** (grátis)
2. Depois de criado, vá em **SQL Editor → New query**, cole o conteúdo de
   `supabase/schema.sql` e rode. Isso cria as tabelas `players`, `matches`,
   `predictions` já com as permissões certas (ninguém edita/apaga palpite).
3. Em **Project Settings → API**, copie:
   - `Project URL` → vai virar `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → vai virar `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → vai virar `SUPABASE_SERVICE_ROLE_KEY` (⚠️ essa é
     secreta, nunca coloque no front-end nem suba pro GitHub público)

## 2. Consiga uma chave de API de futebol

Usei [football-data.org](https://www.football-data.org/client/register) como
exemplo no código (`app/api/cron/update-scores/route.ts`) porque tem plano
grátis. Cadastre-se lá e pegue a `API Token` → isso vai ser `FOOTBALL_API_KEY`.

> Se preferir outra API (API-Football, Sportradar etc), é só trocar o corpo
> da função `fetchBrazilMatches()` nesse arquivo — o resto do projeto não muda.
> Antes de confiar 100% no endpoint que deixei, dá uma conferida na
> documentação oficial da API escolhida, porque esses detalhes mudam com o tempo.

## 3. Configure as variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha tudo, incluindo um
`CRON_SECRET` qualquer (pode gerar com `openssl rand -hex 16`).

## 4. Rode local pra testar

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

Pra testar a busca de placares sem esperar o cron, acesse no navegador:
`http://localhost:3000/api/cron/update-scores?secret=SEU_CRON_SECRET`

## 5. Suba pro GitHub e conecte na Vercel

1. Crie um repositório no GitHub e suba o projeto (`git init`, `git add .`,
   `git commit`, `git push`)
2. Em [vercel.com](https://vercel.com) → **New Project** → importe o repositório
3. Em **Environment Variables**, adicione as mesmas variáveis do `.env.local`
4. Deploy. Pronto, o link já pode ir pro grupo da família.

## 6. Sobre o cron automático

O `vercel.json` já deixa configurado pra rodar `/api/cron/update-scores` a
cada 5 minutos. **Só que no plano Hobby (grátis) da Vercel, cron job só roda
1x por dia** — pra rodar de 5 em 5 minutos de verdade (bom nos dias de jogo),
precisa do plano Pro.

Alternativas sem pagar:
- Em dia de jogo, qualquer um da família acessa
  `https://seu-app.vercel.app/api/cron/update-scores?secret=SEU_CRON_SECRET`
  pelo celular pra forçar a atualização (pode até salvar como atalho na tela
  inicial)
- Ou usar um serviço externo gratuito de "cron" (como cron-job.org) apontando
  pra essa mesma URL de 5 em 5 minutos — assim o Vercel Hobby não precisa
  fazer o agendamento, só recebe a chamada de fora

## Como funciona a trava de palpite

A tabela `predictions` tem um `unique (match_id, player_id)` no banco, e a
política de RLS só permite `insert` — não existe política de `update` nem
`delete` pra chave pública. Ou seja: mesmo que alguém tente mexer direto pelo
DevTools do navegador, o Postgres recusa. A única forma de mudar um palpite
é apagando a linha direto no painel do Supabase (o que só você, como dono do
projeto, consegue fazer).
