# AuxPlus

Plataforma de gestão de clientes, produtos e vencimentos — pronta para o **Dyad**.

## Dados importados

Dump **PostgreSQL** (Neon/Supabase/Dyad): `legacy/auxplus_postgres.sql` ← use este  
Dump MySQL antigo: `legacy/auxplus_dump.sql` (não roda no Postgres)

```bash
node scripts/export-postgres-sql.mjs
```

| | Qtd |
|--|--|
| Usuários | 10 |
| Pastas | 16 |
| Itens | 466 |
| Tickets | 6 |

## Supabase (plano Free)

A app lê/grava no Supabase quando `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` estão definidos (Dyad injeta isso na integração).

### SQL para rodar no Supabase (nessa ordem)

1. `legacy/auxplus_postgres.sql` — tabelas + dados  
2. `legacy/auxplus_rls.sql` — políticas RLS (sem isso o anon key bloqueia)

### Contas

Senhas vêm do dump original (hash bcrypt). Use a **mesma senha do site antigo** (InfinityFree).

Contas stub (`usuario_2`, `usuario_3`, …) → senha `123456`.

Para regenerar seed/SQL a partir do dump MySQL e publicar no Supabase:

```bash
node scripts/import-sql.mjs
node scripts/export-postgres-sql.mjs
node scripts/push-seed-to-supabase.mjs
```

## Abrir no Dyad

1. Abra a pasta `auxplus-app-2` no Dyad  
2. Rode o preview (`npm run dev` / porta 8080)  
3. Se ainda aparecer dados demo antigos, limpe o `localStorage` do preview (chave `auxplus-data-v2`) ou use aba anônima

## Reimportar dump

```bash
# coloque o .sql em legacy/auxplus_dump.sql
node scripts/import-sql.mjs
node scripts/export-clean-sql.mjs
```
