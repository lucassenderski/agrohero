# AgroHero - Frontend

Interface web do marketplace de produtos orgânicos AgroHero.

## Tecnologias

React 18 · Vite 5 · React Router 6

## Configuração

```bash
cd frontend
cp .env.example .env
npm install
```

O `.env` precisa apontar para a API:

```
VITE_API_URL=http://localhost:3001/api/v1
VITE_APP_NOME=AgroHero
```

> Tudo que começa com `VITE_` vai para o bundle do navegador e é **público**. Nunca coloque segredo aqui.

## Executar

O backend precisa estar rodando antes:

```bash
# terminal 1 - banco
docker compose up -d

# terminal 2 - API
cd backend && npm run dev

# terminal 3 - interface
cd frontend && npm run dev
```

Acesse `http://localhost:5173`.

Na Fase 1 a Home mostra um diagnóstico do ambiente. Se aparecer **API: ok** e **PostgreSQL: ok**, a integração está funcionando.

## Build

```bash
npm run build     # gera dist/
npm run preview   # serve o build localmente na porta 4173
```

## Estrutura

```
frontend/src/
├── components/  Header, Footer e, nas próximas fases, ProductCard, CartItem, Modal...
├── contexts/    AuthContext, CartContext (Fase 15)
├── hooks/       useAuth, useCart, useDebounce (Fase 15)
├── layouts/     MainLayout
├── pages/       Home, NaoEncontrada
├── routes/      rotas protegidas por login e por perfil (Fase 15)
├── services/    api.js - cliente HTTP único
├── styles/      tokens.css (design tokens) e global.css
└── utils/       formatadores (Fase 15)
```

## Decisões de interface

**Mobile-first.** O CSS base atende telas pequenas; os ajustes para telas maiores usam `@media (min-width: ...)`.

**Cliente HTTP único.** `services/api.js` centraliza a URL base, o cabeçalho `Authorization`, o tratamento do envelope de erro e o logout automático quando a API responde 401. Escrever isso em cada tela é a origem mais comum de bugs de autenticação.

**Acessibilidade desde o início.** Link "pular para o conteúdo", foco sempre visível, contraste AA e respeito a `prefers-reduced-motion`.

**Autorização de verdade é no backend.** As rotas protegidas do React Router são usadas para experiência do usuário (não mostrar tela que não faz sentido), nunca como barreira de segurança.

## Status do desenvolvimento

| Fase | Descrição | Situação |
|---|---|---|
| 1 | Estrutura, build, integração com `/health` | ✅ concluída |
| 15 | Telas e componentes do marketplace | pendente |
| 16 | Integração completa frontend + backend | pendente |
| 17–19 | Painéis do consumidor, agricultor e administrador | pendente |
