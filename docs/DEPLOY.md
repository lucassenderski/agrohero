# Deploy do AgroHero (plano gratuito)

Este documento explica como publicar o AgroHero na internet sem pagar nada, e por que cada escolha foi feita.

O projeto tem três partes que precisam de hospedagem, e cada uma tem um destino diferente:

| Parte | Onde | Plano gratuito |
|---|---|---|
| Banco PostgreSQL | **Neon** | permanente |
| Backend (API) | **Render** (Web Service) | gratuito, hiberna por inatividade |
| Frontend (React) | **Render** (Static Site) | gratuito |

---

## 1. Por que não hospedar o banco no Render

O caminho mais óbvio seria criar os três serviços no Render. O problema está no PostgreSQL gratuito deles: **ele expira 30 dias depois da criação** e é apagado junto com todos os dados. Não há período de graça nem opção de congelar — depois do prazo, os dados somem.

Isso é aceitável para um teste descartável, mas não para um marketplace que precisa continuar de pé depois da apresentação.

O **Neon** mantém o banco gratuito ligado indefinidamente. O plano inclui:

- 0,5 GB de armazenamento
- 100 horas de processamento por mês
- uma conexão com pooler (útil atrás do Render)

O banco "escala para zero" quando fica ocioso: a primeira consulta depois de um tempo parado demora algumas centenas de milissegundos para acordar. Para esse volume de dados, é o preço justo por não expirar.

> **Sobre as horas de processamento:** o limite de 100 h/mês é o parâmetro que decide se o banco continua grátis. Com o banco ocioso, o consumo é baixo. Se ele ficar sempre acordado e você passar do limite, o Neon passa a cobrar. Vale acompanhar o painel de uso.

---

## 2. Criar o banco no Neon

1. Acesse **https://neon.tech** e entre com a conta do GitHub (é mais rápido que e-mail).
2. Crie um projeto:
   - **Name:** `agrohero`
   - **Postgres version:** 16 (a mesma do `docker-compose.yml`)
   - **Region:** a mais próxima de você — mantenha a mesma região do backend, para a API não conversar com o banco do outro lado do continente.
3. Copie a **connection string** que aparece no painel. Ela se parece com isto:

```
postgresql://usuario:senha@ep-xxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
```

**Guarde essa string.** Ela é o `DATABASE_URL` do backend e contém a senha do banco.

### Por que usar a URL com `-pooler`

O Neon oferece duas URLs: uma direta e uma que passa por um pooler de conexões. Use a **com `-pooler`**.

O motivo: cada instância do Render abre até 10 conexões com o banco (`max: 10` em `src/database/pool.js`). O Neon cobra por tempo de processamento, e cada conexão ociosa segurando o banco acordado consome esse tempo. O pooler reaproveita conexões entre os clientes, então o banco dorme quando ninguém está usando de verdade.

### Por que `?sslmode=require` importa

O `pg` (driver do PostgreSQL) já entende esse parâmetro e liga o TLS sozinho. Provedores gerenciados exigem conexão criptografada, e sem esse trecho a conexão é recusada.

Não é preciso mudar nada no código: a URL carrega a configuração.

---

## 3. Criar os serviços no Render

1. Acesse **https://render.com** e entre com o GitHub.
2. **New +** → **Blueprint**.
3. Escolha o repositório `agrohero`. O Render encontra o `render.yaml` na raiz e mostra os dois serviços que serão criados: `agrohero-api` e `agrohero-web`.
4. Ele vai pedir os valores marcados com `sync: false`. São os segredos e a URL do frontend.

O arquivo `render.yaml` já configura o build, o start, o health check e o rewrite das rotas. Não é preciso preencher nada disso no painel.

### A ordem importa

O `CORS_ORIGINS` do backend precisa conter a URL do frontend, e o `VITE_API_URL` do frontend precisa conter a URL do backend.

Na primeira criação você ainda não conhece nenhuma das duas. Preencha assim:

1. No `agrohero-api`, deixe `CORS_ORIGINS` com um valor temporário qualquer que passe na validação (ex.: `https://exemplo.com`). Vai voltar aqui depois.
2. No `agrohero-web`, deixe `VITE_API_URL` igual à URL que o Render vai dar à API. Como ainda não sabe qual é, use um valor de espaço reservado (ex.: `https://agrohero-api.onrender.com/api/v1`) — provavelmente vai ser exatamente essa, mas confirme depois do deploy.
3. Crie os serviços.
4. Anote as URLs reais que aparecem no painel.
5. Volte em cada serviço, corrija a variável e deixe o Render reimplantar.

Essa ida e volta é normal: os dois serviços se referenciam, e um dos dois precisa ser criado primeiro.

---

## 4. Gerar os segredos

O backend **recusa subir** em produção com segredos de exemplo. Isso é uma guarda em `src/config/verificacaoProducao.js`, e ela existe porque o `.env.example` tem valores de modelo que passariam na validação de tamanho — alguém poderia publicar com o `JWT_SECRET` do repositório, e qualquer pessoa forjar um token de administrador.

Gere dois valores aleatórios:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Rode o comando **duas vezes**: um valor para `JWT_SECRET`, outro para `PAYMENT_WEBHOOK_SECRET`. Não reaproveite o mesmo.

| Variável | Valor |
|---|---|
| `DATABASE_URL` | a connection string do Neon (com `?sslmode=require`) |
| `JWT_SECRET` | valor aleatório gerado acima |
| `PAYMENT_WEBHOOK_SECRET` | outro valor aleatório, diferente do anterior |
| `CORS_ORIGINS` | a URL do frontend no Render, com `https://` |
| `RATE_LIMIT_MAX_LOGIN` | opcional; padrão 10. Suba para ~30 se for demonstrar o sistema |

As três regras que o backend verifica em produção, e que fazem o processo morrer na subida se violadas:

- `JWT_SECRET` e `PAYMENT_WEBHOOK_SECRET` não podem conter `troque`, `placeholder`, `changeme`, `sua_chave` ou `example`;
- `CORS_ORIGINS` não pode conter `*`;
- `CORS_ORIGINS` não pode usar `http://` — em produção, só `https://`.

---

## 5. Aplicar o schema do banco

O banco nasce vazio. As migrations rodam automaticamente a cada deploy, antes do servidor subir, por causa do comando no `render.yaml`:

```
startCommand: npm run migrate && npm start
```

O `&&` é o que dá a garantia: se uma migration falhar, o `npm start` **não roda**, o deploy falha, e a versão anterior continua no ar. É melhor manter a versão antiga funcionando do que subir código novo sobre um schema pela metade.

> **Por que não usar `preDeployCommand`.** Seria o campo mais indicado para migrations, mas ele **só existe em planos pagos** — o plano gratuito não executa o comando. Encadear no `startCommand` produz o mesmo efeito sem custo, porque o migrations runner é idempotente: quando não há nada pendente, ele consulta a tabela de controle e sai.

### Criar o administrador e as categorias

O seed cria as categorias do marketplace e o usuário administrador. Ele **não** roda em todo deploy, e isso é de propósito: ele imprime uma senha aleatória no terminal, que precisa ser lida por uma pessoa.

O problema é onde rodar. O plano gratuito do Render **não oferece Shell** (nem SSH) — só planos pagos. Então não dá para abrir um terminal e digitar `npm run seed`.

A saída é rodar o seed **uma vez**, encadeando no comando de start:

1. No painel do Render, abra `agrohero-api` → **Settings** → **Build & Deploy** → **Start Command**.
2. Troque temporariamente para:

```
npm run migrate && npm run seed && npm start
```

3. Salve. O Render reimplanta e roda o seed.
4. Abra a aba **Logs** e procure o bloco abaixo. **Anote a senha agora** — ela não é mostrada de novo.

```
  ADMINISTRADOR CRIADO
  E-mail: admin@agrohero.local
  Senha : xxxxxxxxxxxxxxxxxxxx
  Anote a senha agora. Ela nao e exibida novamente.
  Troque a senha no primeiro login.
```

5. **Volte o Start Command** para `npm run migrate && npm start`.

> **O seed também passa pela guarda de produção.** Se `JWT_SECRET`, `PAYMENT_WEBHOOK_SECRET` ou `CORS_ORIGINS` estiverem com valor de exemplo, o seed encerra com código 1 e **não cria nada** — a mesma guarda do `src/config/verificacaoProducao.js` roda no seed, porque ele importa o `env.js`. Nesse caso ele imprime a lista de problemas e sai; corrija as variáveis antes de tentar de novo. Como o `&&` no comando de start propaga a falha, o deploy aparece como falho, o que é o comportamento desejado: melhor falhar do que subir sem administrador.

O passo 5 não é opcional: deixar o seed no start faz ele rodar em todo deploy. Como é idempotente não haveria dano, mas também não haveria motivo — e um restart acidental do serviço não deve mexer no banco sem necessidade.

Se o administrador já existir, o seed apenas avisa e sai, sem duplicar nada.

Depois de anotar a senha, troque-a pelo próprio sistema (`PUT /api/v1/usuarios/senha`, ou a tela de perfil).

---

## 6. Testar o que foi publicado

### Backend

```
https://SUA-API.onrender.com/health
```

Resposta esperada com o banco conectado:

```json
{
  "sucesso": true,
  "dados": {
    "api": "ok",
    "banco": "ok",
    "latenciaBancoMs": 12,
    "ambiente": "production",
    "uptimeSegundos": 34,
    "tempoRespostaMs": 15
  }
}
```

Se `banco` vier como `"indisponivel"` (HTTP 503), a API está no ar mas não alcança o Neon. Confira o `DATABASE_URL` e se a string termina com `?sslmode=require`.

O endpoint fica em `/health`, e não em `/api/v1/health`, de propósito: é o caminho que o health check do Render consulta.

### Documentação

O Swagger fica **desligado** em produção (`ENABLE_API_DOCS=false`), porque expor o mapa completo da API facilita a vida de quem procura endpoint sem proteção. Se precisar dele temporariamente para uma conferência, mude a variável para `true`, reimplante, e desligue depois.

### Fluxo completo

Faça o percurso inteiro, que é o mesmo da apresentação:

1. **Cadastro** — crie um produtor e um consumidor.
2. **Login** — os dois.
3. **Produtor** — cadastre um produto com preço e estoque.
4. **Vitrine** — o produto aparece na listagem; use a busca e os filtros.
5. **Carrinho** — adicione o produto.
6. **Checkout** — finalize o pedido (com `PAYMENT_GATEWAY=fake`, o pagamento é simulado e aprovado).
7. **Pedidos** — o produtor vê o pedido, altera o status até `ENTREGUE`.
8. **Avaliação** — o consumidor avalia o produto.

Se o passo 4 não mostrar o produto, o problema costuma ser o `CORS_ORIGINS` (veja abaixo).

---

## 7. Problemas comuns

**A página abre, mas nada carrega e o console do navegador mostra erro de CORS.**

O `CORS_ORIGINS` do backend não bate com a URL do frontend. Precisa ser exatamente a origem que aparece na barra do navegador: com `https://`, sem barra no final, sem caminho depois do domínio. Depois de corrigir, o Render reimplanta sozinho.

**O frontend chama `localhost:3001`.**

O `VITE_API_URL` foi lido em tempo de build, não de execução — o navegador é que lê essa variável, não há servidor para injetá-la depois. Se a variável estava errada ou ausente no momento do build, o bundle ficou gravado com o valor antigo. Corrija a variável e **force um novo deploy**; só salvar a variável não basta.

**A primeira requisição demora cerca de um minuto.**

É a hibernação do plano gratuito do Render: o serviço dorme depois de 15 minutos sem uso e leva cerca de um minuto para acordar na requisição seguinte. Não é erro. Para a apresentação, abra o site alguns minutos antes, para o serviço já estar acordado.

**Depois de vários cadastros e logins seguidos, aparece "Muitas tentativas de login".**

O limite é de **10 requisições de login/cadastro por IP a cada 15 minutos** (`RATE_LIMIT_MAX_LOGIN`). O `trust proxy` já está configurado, então cada visitante é contado pelo IP real e não pelo IP do proxy do Render — mas **todos os acessos de uma mesma rede saem pelo mesmo IP**.

Isso morde justamente na hora da demonstração: você cria duas ou três contas enquanto ensaia, e na apresentação o limite já estourou. Duas saídas:

- ajustar `RATE_LIMIT_MAX_LOGIN` nas variáveis de ambiente do Render (ex.: `30`) e reimplantar;
- ou aguardar os 15 minutos, que é o que a mensagem pede.

O limite geral da API é bem mais folgado: 300 requisições por 15 minutos por IP (`RATE_LIMIT_MAX_REQUISICOES`). Ele é o que protege a API de varredura, e não vale afrouxar sem motivo.

**As imagens são URLs, e ainda não há upload.**

O produto guarda apenas `imagem_url` (uma URL que você informa no cadastro); o arquivo nunca é enviado para a API. **Não existe endpoint de upload implementado** — não há `multer` nem o SDK do Cloudinary nas dependências.

As variáveis `STORAGE_DRIVER` e `CLOUDINARY_*` do `.env.example` estão reservadas para quando o upload for implementado: o `env.js` já as valida, mas **nenhum código as consome hoje**. Não perca tempo configurando Cloudinary para o deploy; sem o endpoint, elas não mudam nada.

Para a demonstração, use URLs de imagens públicas já hospedadas (por exemplo, uma imagem no Wikimedia Commons ou no seu próprio repositório). A coluna aceita qualquer URL válida, e a vitrine exibe normalmente.

---

## 8. Custos e limites

| Recurso | Limite gratuito | O que acontece ao passar |
|---|---|---|
| Render Web Service | 750 h/mês, hiberna após 15 min | serviço suspenso no fim do mês |
| Render Static Site | 100 GB de banda/mês | site fora do ar até o próximo mês |
| Neon | 0,5 GB e 100 h de processamento/mês | conta passa a ser cobrada |

Alternativas avaliadas, e por que não foram escolhidas:

- **Railway** — não tem mais plano gratuito; são US$ 5 de crédito que expiram em cerca de 30 dias.
- **Fly.io** — sem plano gratuito para contas novas; o PostgreSQL gerenciado começa em cerca de US$ 38/mês.
- **Supabase** — o banco gratuito pausa após 7 dias sem uso e precisa ser reativado à mão, o que derrubaria a API sem aviso. Bom para quem quer autenticação e storage junto, o que não é o caso aqui.

---

## 9. Depois do deploy

- [ ] `/health` responde `ok` com o banco conectado
- [ ] `npm run seed` rodou e a senha do administrador foi anotada
- [ ] cadastro e login funcionam no site publicado
- [ ] o produtor consegue cadastrar produto e ele aparece na vitrine
- [ ] o checkout cria o pedido e baixa o estoque
- [ ] o produtor consegue alterar o status do pedido
- [ ] a troca de senha do administrador foi feita
- [ ] o painel de uso do Neon está sendo acompanhado

---

## Referências

- [Render — blueprint.yaml](https://render.com/docs/blueprint-spec)
- [Render — free tier](https://render.com/docs/free)
- [Neon — plano gratuito](https://neon.tech/docs/introduction/plans)
- [Cloudinary — plano gratuito](https://cloudinary.com/pricing)