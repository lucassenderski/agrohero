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

O rodapé exibe, de forma discreta, o estado real da infraestrutura — `API: ok`, `PostgreSQL: ok`, `Ambiente` e a latência do banco — buscado de `/health` em tempo de execução, junto ao crédito do autor. Esses dados ficam **só no rodapé**: a Home é conteúdo para o consumidor e não mostra informação técnica.

## Build

```bash
npm run build     # gera dist/
npm run preview   # serve o build localmente na porta 4173
```

## Estrutura

```
frontend/src/
├── components/  Header, Footer, ProductCard, CartItem, ui...
├── contexts/    AuthContext, CarrinhoContext, NotificacaoContext
├── dados/       receitas.js - conteudo editorial
├── hooks/       useRequisicao, useAuth, useCarrinho...
├── layouts/     MainLayout
├── pages/       Home, Produtos, ProdutoDetalhe, Categorias, Receitas,
│                Sobre, Agricultores, AgricultorDetalhe, Login, Cadastro,
│                Carrinho, Checkout, Pedidos, Perfil e os paineis
├── routes/      rotas protegidas por login e por perfil
├── services/    api.js - cliente HTTP unico
├── styles/      tokens.css (design tokens) e global.css
└── utils/       formatadores
```

**Paginas de conteudo editorial.** `Sobre` e `Receitas` nao dependem da API para o texto
propriamente dito: o conteudo vive no frontend e a pagina abre mesmo com o backend fora do ar.
`Receitas` liga os ingredientes ao catalogo real, mas o modo de preparo continua sendo editorial.
A pagina `Sobre` (`/sobre`) e alcancada pelo link "Sobre a iniciativa" na barra superior do
cabecalho.

## Decisões de interface

**Mobile-first.** O CSS base atende telas pequenas; os ajustes para telas maiores usam `@media (min-width: ...)`.

**Cliente HTTP único.** `services/api.js` centraliza a URL base, o cabeçalho `Authorization`, o tratamento do envelope de erro e o logout automático quando a API responde 401. Escrever isso em cada tela é a origem mais comum de bugs de autenticação.

**Acessibilidade desde o início.** Link "pular para o conteúdo", foco sempre visível, contraste AA e respeito a `prefers-reduced-motion`.

**Autorização de verdade é no backend.** As rotas protegidas do React Router são usadas para experiência do usuário (não mostrar tela que não faz sentido), nunca como barreira de segurança.

## Status do desenvolvimento

| Fase | Descrição | Situação |
|---|---|---|
| 1 | Estrutura, build, integração com `/health` | ✅ concluída |
| 15 | Telas e componentes do marketplace | ✅ concluída |
| 16 | Integração completa frontend + backend | ✅ concluída |
| 17–19 | Painéis do consumidor, agricultor e administrador | ✅ concluída |

## Testes

São de integração: **nenhum `fetch` é mockado**, cada teste fala com a API real. Isso é deliberado — o que precisa ser verificado é justamente o que um mock esconderia: o formato do envelope, os nomes dos campos, os códigos de erro e as regras de autorização.

São **62 testes em 11 arquivos**. Exigem um backend no ar, em modo `test` (nesse modo o rate limit fica desligado; sem isso, uma suíte com vários cadastros estoura o limite e falha por motivo errado):

```bash
# terminal 1 - API em modo de teste
cd backend
NODE_ENV=test PORT=3002 \
  DATABASE_URL=postgresql://agrohero:agrohero_dev@localhost:5433/agrohero_test \
  node src/server.js

# terminal 2 - testes
cd frontend
npm test          # executa uma vez (vitest run)
npm run test:watch
```

Os testes usam `http://localhost:3002/api/v1` por padrão; para apontar para outro servidor, defina `VITE_API_URL` antes de rodar.

> A suíte do backend **esvazia `categorias`** ao recriar o schema. Como estes testes criam produtos de verdade usando `categorias[0].id`, rode o `run-seeds.js` entre as duas suítes, senão a do frontend falha em cascata.
