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

## Testes

```bash
npm test
```

Os testes de integração sobem o Express e usam o PostgreSQL real (banco `agrohero_test`), com `NODE_ENV=test`. Não há mock de banco: o objetivo é validar o comportamento de verdade.

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
| 2 | Banco de dados (migrations e seeds) | próxima |
| 3–24 | Backend base, auth, produtos, carrinho, checkout, pedidos, painéis, segurança, testes, deploy | pendente |

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
