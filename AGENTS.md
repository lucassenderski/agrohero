# AGENTS.md — contexto do projeto AgroHero

Marketplace de produtos orgânicos que conecta agricultores familiares a consumidores.
Monorepo: `backend/` (Express + PostgreSQL) e `frontend/` (React + Vite).

## Como rodar

O Docker precisa estar no ar; em alguns ambientes o daemon cai entre sessões:

```bash
sudo dockerd > /tmp/dockerd.log 2>&1 &   # se necessário
cd /workspace/project && sudo docker compose up -d
```

Depois:

```bash
cd backend && npm run migrate && npm run seed && npm run dev   # porta 3001
cd frontend && npm run dev                                     # porta 5173
```

O PostgreSQL é publicado na **porta 5433** (não 5432) para não conflitar com instalações locais.

## Comandos

| Comando | Onde | O que faz |
|---|---|---|
| `npm run migrate` | backend | Aplica migrations pendentes (idempotente) |
| `npm run seed` | backend | Categorias + admin (idempotente) |
| `npm test` | backend | Testes de integração (recriam o schema do zero) |
| `npm run dev` | backend | API com reload |
| `npm run dev` / `build` | frontend | Vite |

## Ambiente descartável — atenção

O sandbox pode reiniciar entre sessões e **o banco perde os dados**. O código é a fonte de verdade: recrie o ambiente com `npm run migrate && npm run seed`. Nada é perdido, porque tudo vem de migration versionada.

## Convenções que não devem ser quebradas

**Idioma.** Tudo em português: nomes de tabelas, colunas, variáveis, funções, mensagens de erro e comentários. Comentários são escritos sem acento (e sem caracteres especiais) para evitar problemas de encoding; strings de interface e mensagens ao usuário usam acentuação normal.

**Comentários.** Comentar apenas o que é não óbvio: decisões de segurança, invariantes, por que uma alternativa foi descartada. Não narrar o código, não descrever histórico de mudanças.

**Validação.** Schemas Zod em `src/utils/validacao.js` (reutilizáveis) e por módulo. Controller lê `req.dadosValidados`, nunca `req.body`.

**Erros.** `AppError(mensagem, status, codigo)`. Erros de validação saem como `400` com `detalhes: [{ campo, mensagem }]`.

**SQL.** Sempre parametrizado. Ordenação por lista branca via `resolverOrdenacao()`.

**Autorização.** O proprietário de um recurso é sempre resolvido a partir do **token**, nunca do corpo ou do parâmetro da requisição. É a defesa central contra IDOR.

## Arquitetura

```
src/
├── config/       env.js (validado com Zod), logger.js
├── controllers/  recebem req/res, sem SQL
├── middlewares/  checkJwt, requireRole, validar, errorHandler, rateLimit
├── repositories/ SQL parametrizado (estende RepositorioBase)
├── routes/       rotas e ordem dos middlewares
├── services/     regras de negócio
├── database/     pool.js, migrations/, seeds/, run-migrations.js
├── docs/         openapi.js
└── utils/        AppError, validacao, paginacao, senha, resposta
```

Fluxo de uma requisição: `rota → middleware (auth → autorização → validação) → controller → service → repository → PostgreSQL`.

## Banco de dados

11 tabelas de negócio. Decisões que afetam o código:

- **`pedido_itens.status` é por item**, e `pedidos.status` é derivado por trigger. Um agricultor altera só os itens dele (`WHERE agricultor_id = ...`), que é a regra multi-agricultor.
- **`pedido_itens.agricultor_id` é denormalizado** de propósito, para a checagem de posse não depender de JOIN.
- **Preços congelados** em `pedido_itens.preco_unitario` e `carrinho_itens` **não guarda preço** — o valor oficial é lido de `produtos` no checkout.
- **`pedido.endereco_entrega` é JSONB** (snapshot), não FK.
- Constraints no banco são a última linha de defesa (preço > 0, subtotal coerente, etc.), mesmo que o service valide antes.
- `pagamentos` não tem nenhuma coluna de cartão, por decisão de segurança.

## Documentação

- `/api/v1/docs` — Swagger UI. Em produção vem desativada (`ENABLE_API_DOCS`).
- A especificação documenta **apenas rotas implementadas**, e há teste que garante isso.
- Ao implementar uma rota, adicione-a em `src/docs/openapi.js`, no README do backend e na tabela de API do README da raiz.

## Testes

Sempre com banco real — sem mocks. `tests/helpers/banco.js` recria o schema e cria cenários. Cobrir caminhos negativos (IDOR, permissão, valores inválidos), não só o caso feliz.

## Segurança — checklist por fase

- IDOR: proprietário vem do token
- Role: `requireRole` em toda rota sensível
- Preço/quantidade/estoque recalculados no servidor
- SQL parametrizado
- Nada de segredo no código; `.env` fora do Git
- Log não registra senha, token ou dados de cartão

## Estado

Fases 0–3 concluídas (estrutura, banco, backend base). Próxima: FASE 4 (usuários).
Divergências encontradas no ambiente (ex.: container de banco caído) foram diagnosticadas e resolvidas, não contornadas.