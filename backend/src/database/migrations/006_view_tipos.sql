-- ==========================================================
-- 006 - Tipos da view produtos_com_avaliacao
-- ==========================================================
-- Corrige dois tipos que o driver do Node devolve de forma inesperada.
--
-- O PROBLEMA
--
-- A view foi criada em 005 com:
--   count(a.id)      -> bigint
--   avg(a.nota)      -> numeric
--
-- O driver `pg` nao converte bigint nem numeric para number: ele devolve
-- STRING, para nao perder precisao em valores maiores que um double. O
-- efeito pratico e que `total_avaliacoes` chegava ao JSON como "0" e nao
-- como 0, e o frontend nao conseguia comparar (`total === 0` era falso
-- para um produto sem nenhuma avaliacao).
--
-- A CORRECAO
--
-- O cast para int e float8 acontece na view, e nao em cada consulta.
-- Motivo: a view tem varios consumidores (a vitrine do produtor nesta
-- fase, a ordenacao por relevancia na FASE 9, os paineis depois). Corrigir
-- na view resolve para todos de uma vez, e evita que cada novo consumidor
-- precise lembrar de fazer o cast.
--
-- Por que uma migration nova em vez de editar a 005: a 005 ja foi aplicada
-- nos bancos de desenvolvimento. Alterar um arquivo ja executado nao teria
-- efeito nenhum neles - o controle de migrations so registra quais rodaram.
--
-- Por que DROP e nao CREATE OR REPLACE: o PostgreSQL recusa CREATE OR
-- REPLACE VIEW quando o tipo de uma coluna muda ("cannot change data type
-- of view column"). Como e exatamente isso que precisamos fazer, a view
-- precisa ser removida antes.
--
-- Sobre o drop: a view nao e referenciada por nenhuma outra view nem por
-- chave estrangeira (e so uma projecao de produtos + avaliacoes), entao
-- DROP VIEW simples basta. Se algum dia outra view passar a depender
-- desta, o drop falha alto e o erro aparece aqui - o que e melhor do que
-- um CASCADE que removeria a dependencia em silencio.
DROP VIEW IF EXISTS produtos_com_avaliacao;

CREATE VIEW produtos_com_avaliacao AS
SELECT
  p.id,
  p.nome,
  p.preco,
  p.estoque,
  p.ativo,
  p.categoria_id,
  p.agricultor_id,
  round(coalesce(avg(a.nota), 0), 2)::float AS media_avaliacoes,
  count(a.id)::int                          AS total_avaliacoes
FROM produtos p
LEFT JOIN avaliacoes a ON a.produto_id = p.id
GROUP BY p.id;

COMMENT ON VIEW produtos_com_avaliacao IS
  'Produtos com media e total de avaliacoes. Tipos convertidos para float8 e int porque o driver pg devolve bigint e numeric como string.';
