-- ==========================================================
-- 010 - Avatar do usuario (foto de perfil)
-- ==========================================================
--
-- CONTEXTO DA MUDANCA
--
-- O projeto previa um avatar e nunca o construiu: `utils/formato.js` tem
-- a funcao `iniciais(nome)` com o comentario "Iniciais para o avatar
-- quando nao ha foto", e nenhuma tela a chamava. A area do usuario no
-- cabecalho mostrava apenas o primeiro nome como texto.
--
-- A infraestrutura de imagem (ver 009_logo_propriedade.sql) ja existia,
-- mas e da LOGO DA PROPRIEDADE: vive em `agricultores` e a rota exige
-- `requireRole('agricultor')`. Um consumidor nao tinha onde guardar
-- imagem nenhuma.
--
-- Agora todo usuario - cliente, produtor ou administrador - pode escolher
-- uma foto de perfil. A coluna vai em `usuarios`, que e a tabela de todas
-- as contas, e nao em `agricultores`.
--
-- POR QUE OS BYTES NO BANCO, E NAO EM DISCO OU CDN
--
-- Mesma razao da 009: o disco do Render (plano gratuito) e efemero, e um
-- CDN adicionaria um terceiro servico e mais tres segredos para vigiar. A
-- porta para o CDN continua aberta (ver STORAGE_DRIVER em config/env.js).
--
-- O avatar e MENOR que a logo de proposito: aparece em miniatura de 32 a
-- 96 px. O perfil `avatar` de `services/imagemService.js` reamostra para
-- no maximo 512x512 e mira 60 KB, contra 800x800 e 200 KB da logo. Uma
-- foto de celular de 9 MB vira isso - o banco gratuito do Neon (0,5 GB)
-- comporta milhares de avatares.
--
-- PRIVACIDADE
--
-- O avatar NAO ganha rota publica. Nao ha `GET /usuarios/:id/avatar`, e a
-- decisao e deliberada: as avaliacoes publicas expoem apenas o PRIMEIRO
-- NOME de quem comprou (ver o comentario em `avaliacaoRepository.js`),
-- justamente para nao ligar uma pessoa a uma compra. Uma foto de rosto
-- indexada por id de usuario e um identificador mais forte que o nome que
-- o projeto limitou de proposito. Entao o avatar e servido so para o dono,
-- por rota autenticada, e o que aparece nas telas de terceiros sao as
-- iniciais com a cor derivada do nome.
--
-- COLUNAS
--
--   avatar_bytes -> os bytes do WebP. NULL para quem nao escolheu foto
--                   (o caso da maioria): o banco nao gasta nada com quem
--                   nunca enviou arquivo.
--   avatar_mime  -> o tipo real, para servir com o Content-Type correto.
--                   Nunca o mimetype informado pelo cliente, que mente.
--
-- SEGURANCA
--
-- Nao ha coluna nova para nome de arquivo, extensao ou dimensoes
-- originais. O nome enviado pelo usuario nunca e guardado nem usado em
-- caminho de arquivo - o que elimina traversal e injecao de nome. O
-- formato e reconhecido lendo os bytes (magic bytes), nao a extensao.
--
-- IDEMPOTENCIA
--
-- `IF NOT EXISTS` nas colunas e `DROP CONSTRAINT IF EXISTS` antes de cada
-- `ADD`: um deploy repetido nao pode abortar por o objeto ja existir. A
-- 008 mostrou o custo disso - uma migration que falha derruba o servidor
-- no startCommand (`npm run migrate && npm start`).
--
-- Diferente da 008, esta NAO tem pre-condicao de dados: as colunas
-- nascem NULL em todas as linhas, e a CHECK aceita o par NULL/NULL. Nao
-- ha linha antiga capaz de violar as constraints novas, entao rodar no
-- Neon nao exige preparar dados antes.
-- ==========================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS avatar_bytes BYTEA;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS avatar_mime  VARCHAR(60);

-- As duas colunas caminham juntas: um avatar tem bytes E tipo, ou nao
-- tem nenhum dos dois. Sem esta checagem, um bug futuro que gravasse
-- apenas uma das duas produziria uma resposta com Content-Type nulo -
-- o navegador baixaria o arquivo em vez de exibir.
ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS usuarios_avatar_completo;

ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_avatar_completo
  CHECK (
    (avatar_bytes IS NULL AND avatar_mime IS NULL)
    OR (avatar_bytes IS NOT NULL AND avatar_mime IS NOT NULL)
  );

-- Teto de seguranca no proprio banco.
--
-- O service mira 60 KB, mas uma constraint e a unica defesa que vale
-- mesmo se o caminho de escrita mudar (um script, um seed, um ajuste
-- manual). 128 KB da margem larga sobre o alvo real e ainda impede que um
-- bug grave megabytes por linha.
ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS usuarios_avatar_tamanho;

ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_avatar_tamanho
  CHECK (avatar_bytes IS NULL OR length(avatar_bytes) <= 131072);

COMMENT ON COLUMN usuarios.avatar_bytes IS
  'Bytes do WebP do avatar (no maximo 512x512). NULL quando o usuario nao escolheu foto. Servido apenas ao dono, em rota autenticada.';

COMMENT ON COLUMN usuarios.avatar_mime IS
  'Content-Type real do avatar, definido pelo servidor a partir dos magic bytes - nunca o mimetype enviado pelo cliente.';
