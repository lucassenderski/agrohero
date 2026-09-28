-- ==========================================================
-- 009 - Logo da propriedade (imagem enviada pelo produtor)
-- ==========================================================
--
-- CONTEXTO DA MUDANCA
--
-- A coluna `agricultores.imagem_url` (ver 002_identidade.sql) sempre
-- existiu, mas nunca teve quem a escrevesse: o frontend caia no emoji
-- de fallback. O produtor nao podia escolher uma imagem.
--
-- Agora ele pode enviar um arquivo. O problema e ONDE guardar o arquivo.
--
-- Por que os BYTES ficam no banco, e nao em disco ou num CDN:
--
--   1. O Render do plano gratuito NAO tem disco persistente. O
--      filesystem e efemero: um arquivo gravado localmente some no
--      proximo deploy, no restart e quando o servico hiberna (15 min
--      de inatividade). Guardar em disco daria uma logo que aparece e
--      desaparece, sem erro visivel - o pior tipo de falha.
--
--   2. Um CDN (Cloudinary) resolve, mas adiciona um terceiro servico,
--      tres segredos no painel e mais uma cota gratuita para vigiar.
--      As variaveis ja existem em env.js, entao a porta fica aberta
--      para migrar depois, sem mudar o resto do desenho.
--
--   3. A imagem e reamostrada e reencodada ANTES de chegar aqui (ver
--      `services/logoService.js`): no maximo 800x800 em WebP q82, o
--      que na pratica fica em torno de 150 KB. Uma foto de celular de
--      9 MB vira isso - medido, 98% de reducao. O banco gratuito do
--      Neon tem 0,5 GB, entao sao centenas de logos dentro do limite.
--
-- Por que NAO usamos apenas `imagem_url` com os bytes: a URL aponta
-- para o proprio endpoint (GET /agricultores/:id/logo). Guardar uma URL
-- absoluta no banco amarraria as linhas ao dominio atual, o que quebra
-- ao trocar de dominio ou de ambiente. A URL e derivada em tempo de
-- leitura, a partir do `id`, que nunca muda.
--
-- COLUNAS
--
--   logo_bytes -> os bytes do WebP. NULL quando o produtor usa a logo
--                 padrao (o caso da maioria): assim o banco nao gasta
--                 nada com quem nunca enviou arquivo.
--   logo_mime  -> o tipo real, para servir com o Content-Type correto.
--                 Nunca o mimetype informado pelo cliente, que mente.
--
-- `imagem_url` e `imagem_public_id` ficam como estao. A primeira nao e
-- mais escrita pelo fluxo novo (a URL e derivada), e a segunda era do
-- armazenamento externo - remover coluna sem necessidade e o tipo de
-- alteracao irreversivel que o deploy nao precisa correr. Se um dia o
-- Cloudinary entrar, `imagem_public_id` volta a ter uso.
--
-- SEGURANCA
--
-- Nao ha coluna nova para nome de arquivo, extensao ou dimensoes
-- originais. O nome enviado pelo usuario nunca e guardado nem usado em
-- caminho de arquivo - o que elimina traversal e injecao de nome. O
-- formato e reconhecido lendo os bytes (magic bytes), nao a extensao.
-- ==========================================================

-- `IF NOT EXISTS` de proposito: um deploy repetido nao pode abortar por
-- a coluna ja existir. A 008 mostrou que uma migration que falha derruba
-- o servidor no startCommand (`npm run migrate && npm start`).
ALTER TABLE agricultores
  ADD COLUMN IF NOT EXISTS logo_bytes BYTEA;

ALTER TABLE agricultores
  ADD COLUMN IF NOT EXISTS logo_mime  VARCHAR(60);

-- As duas colunas caminham juntas: uma logo tem bytes E tipo, ou nao
-- tem nenhum dos dois. Sem esta checagem, um bug futuro que gravasse
-- apenas uma das duas produziria uma resposta com Content-Type nulo -
-- o navegador baixaria o arquivo em vez de exibir.
ALTER TABLE agricultores
  DROP CONSTRAINT IF EXISTS agricultores_logo_completa;

ALTER TABLE agricultores
  ADD CONSTRAINT agricultores_logo_completa
  CHECK (
    (logo_bytes IS NULL AND logo_mime IS NULL)
    OR (logo_bytes IS NOT NULL AND logo_mime IS NOT NULL)
  );

-- Teto de seguranca no proprio banco.
--
-- O service ja garante ~150 KB, mas uma constraint e a unica defesa que
-- vale mesmo se o caminho de escrita mudar (um script, um seed, um
-- ajuste manual). 512 KB da margem larga sobre o alvo real e ainda
-- impede que um bug grave megabytes por linha.
ALTER TABLE agricultores
  DROP CONSTRAINT IF EXISTS agricultores_logo_tamanho;

ALTER TABLE agricultores
  ADD CONSTRAINT agricultores_logo_tamanho
  CHECK (logo_bytes IS NULL OR length(logo_bytes) <= 524288);
