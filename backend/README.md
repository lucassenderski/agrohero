# AgroHero - Backend

API REST do marketplace de produtos orgânicos AgroHero.

## Tecnologias

Node.js 22 · Express 4 · PostgreSQL 16 · `pg` · JWT · bcrypt · Zod · Pino

## Arquitetura em camadas

```
routes      → define URL e middlewares (sem lógica)
middlewares → checkJwt, requireRole, validate, errorHandler, rateLimit
controllers → lê req, chama o service, monta a resposta (sem SQL)
services    → regra de negócio e transações (sem SQL)
repositories→ único lugar com SQL, sempre parametrizado ($1, $2...)
database    → pool de conexões e transações
```

Regra que não se quebra: **controller não escreve SQL, repository não decide regra de negócio, service não conhece `req`/`res`**.

## Configuração

### 1. Banco de dados

O PostgreSQL roda via Docker Compose na raiz do repositório:

```bash
cd ..
docker compose up -d
docker compose ps          # deve mostrar "healthy"
```

### 2. Variáveis de ambiente

```bash
cd backend
cp .env.example .env
```

Gere um `JWT_SECRET` forte:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Dependências

```bash
npm install
```

## Executar

```bash
npm run dev     # desenvolvimento, com reload automático
npm start       # produção
```

A API sobe em `http://localhost:3001`.

### Verificar

```bash
curl http://localhost:3001/health
```

Resposta esperada:

```json
{
  "sucesso": true,
  "dados": {
    "api": "ok",
    "banco": "ok",
    "latenciaBancoMs": 2,
    "ambiente": "development"
  }
}
```

Se o banco estiver parado, o `/health` responde **503** com `banco: "indisponivel"` — a API continua no ar e volta a funcionar sozinha quando o banco voltar.

## Banco de dados

### Migrations

```bash
npm run migrate
```

Cada arquivo roda dentro de sua própria transação, então uma falha no meio reverte o arquivo por inteiro e nunca deixa o schema pela metade. O histórico fica na tabela `migrations`.

| Arquivo | O que cria |
|---|---|
| `001_funcoes_base.sql` | função `atualizar_timestamp()` |
| `002_identidade.sql` | `usuarios`, `agricultores`, `enderecos` |
| `003_catalogo.sql` | `categorias`, `produtos` |
| `004_pedidos.sql` | `carrinhos`, `carrinho_itens`, `pedidos`, `pedido_itens` e o trigger de sincronização de status |
| `005_pagamentos_avaliacoes.sql` | `pagamentos`, `avaliacoes` e a view `produtos_com_avaliacao` |

### Seeds

```bash
npm run seed
```

Idempotentes: podem rodar em todo deploy. Criam as 7 categorias e o administrador (com senha aleatória exibida uma única vez).

### Decisões de modelagem

**O status pertence ao item, não só ao pedido.** Um pedido pode ter produtos de vários produtores, então cada `pedido_itens` tem seu próprio `status`. O `pedidos.status` é derivado do conjunto por um trigger, e um agricultor só consegue alterar os itens dele porque toda query filtra por `agricultor_id` — que é denormalizado de propósito em `pedido_itens`.

**Preços são congelados em `pedido_itens.preco_unitario`.** Se o produtor reajustar o preço amanhã, o pedido de hoje mantém o valor combinado.

**`carrinho_itens` não guarda preço.** O preço oficial é sempre lido de `produtos` no checkout. Se estivesse no carrinho, seria um campo manipulável pelo cliente.

**O endereço do pedido é um snapshot em JSONB.** O cliente pode editar ou apagar um endereço depois; o pedido precisa continuar mostrando para onde foi enviado.

**Índices parciais onde fazem diferença.** `produtos_disponiveis_idx` cobre só `ativo = TRUE`, que é o que as listagens públicas consultam. `enderecos_um_principal_por_consumidor` é um índice único parcial que garante no banco que cada consumidor tem no máximo um endereço principal — sem condição de corrida.

**Busca textual em português.** Índices GIN com `to_tsvector('portuguese', ...)` em `produtos` e `agricultores`, para busca por termo e radical.

### Testar o banco

```bash
npm test
```

46 testes, incluindo os negativos: preço negativo, estoque negativo, total incoerente, subtotal manipulado, nota fora de 1–5, IDOR entre produtores e CEP inválido.

Os testes recriam o schema do zero a cada execução no banco `agrohero_test`, então não dependem de migrations aplicadas previamente. Não há mock de banco: o objetivo é validar o comportamento real.

## Estrutura

```
backend/
├── src/
│   ├── config/       env.js (validação) e logger.js (com redação de segredos)
│   ├── database/     pool.js, migrations/, seeds/
│   ├── controllers/  camada HTTP
│   ├── middlewares/  auth, validação, erros, rate limit
│   ├── repositories/ acesso a dados (SQL parametrizado)
│   ├── routes/       definição das rotas
│   ├── services/     regra de negócio
│   ├── utils/        AppError, asyncHandler, resposta, paginação
│   ├── validators/   esquemas Zod
│   ├── app.js        montagem do Express (sem listen)
│   └── server.js     subida do servidor e desligamento gracioso
└── tests/
    ├── setup.js
    └── integration/
```

## Status do desenvolvimento

| Fase | Descrição | Situação |
|---|---|---|
| 1 | Estrutura, PostgreSQL local, `/health` | ✅ concluída |
| 2 | Banco de dados (migrations e seeds) | ✅ concluída |
| 3 | Backend base | próxima |
| 4–24 | Auth, produtos, carrinho, checkout, pedidos, painéis, segurança, testes, deploy | pendente |

## Padrões da API

Envelope único em todas as respostas:

```json
{ "sucesso": true, "dados": { }, "paginacao": { "pagina": 1, "limite": 20, "total": 0 } }
{ "sucesso": false, "erro": { "codigo": "ESTOQUE_INSUFICIENTE", "mensagem": "..." } }
```

Códigos: 400 validação · 401 não autenticado · 403 sem permissão · 404 não encontrado · 409 conflito · 422 regra de negócio · 500 interno.

## Segurança (já ativa na Fase 1)

- `helmet` com `x-powered-by` desativado
- CORS com lista branca (`CORS_ORIGINS`); origem desconhecida recebe **403**
- Rate limit global e rate limit estrito em `/auth` (Fase 5)
- Limite de 1 MB no corpo das requisições
- Validação de variáveis de ambiente na subida (falha rápido se faltar segredo)
- Log com redação automática de `senha`, `token`, `authorization`, `cvv`
- Stack trace apenas no log, nunca na resposta HTTP
- `.env` fora do versionamento; `.env.example` sem segredos
