-- ==========================================================
-- 008 - Pagamento na retirada
-- ==========================================================
--
-- CONTEXTO DA MUDANCA
--
-- A versao inicial cobrava online: o checkout chamava um gateway
-- (Mercado Pago ou o simulador) e o resultado chegava por webhook. O
-- pagamento era do PEDIDO inteiro, com status PENDENTE/APROVADO/
-- RECUSADO e colunas para o identificador da transacao no gateway.
--
-- Agora o pagamento e feito NO LOCAL DA RETIRADA. Consequencias para o
-- schema:
--
--   1. Nao ha gateway. As colunas `identificador_externo` (id da
--      transacao no provedor) e `resumo_gateway` (resposta resumida do
--      provedor) perdem sentido e saem.
--
--   2. O pagamento passa a ser POR PRODUTOR, e nao do pedido. Um pedido
--      pode ter itens de varios produtores (ver 004_pedidos.sql), e cada
--      um recebe o seu na retirada. Com uma linha por pedido, "quem
--      confirma o recebimento?" nao teria resposta, e um produtor
--      confirmaria o pagamento do produto de outro - exatamente o
--      vazamento entre produtores que o resto do sistema evita.
--
--   3. Os metodos passam a ser os do balcao: PIX, CARTAO e DINHEIRO.
--      BOLETO sai (nao se compensa um boleto na retirada) e SIMULADO
--      sai junto com o gateway de teste.
--
--   4. O status perde RECUSADO e REEMBOLSADO. Nao ha recusa possivel:
--      a maquina nao aprova nem nega nada, o pagamento acontece na
--      frente das duas partes. E nao ha reembolso: o dinheiro nunca
--      passou pelo sistema, entao devolver e um ato presencial, fora
--      daqui. Fica PENDENTE (a receber), PAGO e CANCELADO.
--
-- ESTA MIGRATION NAO E SO ESCRITA: ela roda sobre o banco de
-- desenvolvimento e de teste, que estao com ZERO linhas em `pagamentos`
-- (verificado). Se houvesse linhas, o DROP COLUMN apagaria o
-- `identificador_externo` sem chance de reconciliar com o gateway - o
-- motivo de a migration vir com esta nota em vez de um DELETE silencioso.

-- ----------------------------------------------------------
-- 1. Colunas que pertenciam ao gateway
-- ----------------------------------------------------------
ALTER TABLE pagamentos
  DROP COLUMN IF EXISTS identificador_externo,
  DROP COLUMN IF EXISTS resumo_gateway;

-- ----------------------------------------------------------
-- 2. Pagamento por produtor
-- ----------------------------------------------------------
-- ON DELETE RESTRICT, igual a pedido_itens.agricultor_id: um pagamento
-- ja registrado nao pode perder o dono. Excluir produtor com venda vira
-- desativacao, nunca DELETE.
ALTER TABLE pagamentos
  ADD COLUMN agricultor_id BIGINT REFERENCES agricultores (id) ON DELETE RESTRICT;

-- `pedido_itens.agricultor_id` sustenta a mesma denormalizacao pelo
-- mesmo motivo: identificar o dono sem JOIN, e manter o vinculo mesmo
-- que o produto mude de produtor depois.
UPDATE pagamentos p
   SET agricultor_id = (
     SELECT pi.agricultor_id
       FROM pedido_itens pi
      WHERE pi.pedido_id = p.pedido_id
      ORDER BY pi.id
      LIMIT 1
   )
 WHERE p.agricultor_id IS NULL;

ALTER TABLE pagamentos
  ALTER COLUMN agricultor_id SET NOT NULL;

-- Um pagamento por produtor em cada pedido. O checkout cria a linha uma
-- vez e depois so atualiza o status, entao a unicidade nao atrapalha
-- nenhum fluxo - ela impede um bug de criar a cobranca duas vezes.
ALTER TABLE pagamentos
  ADD CONSTRAINT pagamentos_pedido_agricultor_unico
  UNIQUE (pedido_id, agricultor_id);

CREATE INDEX pagamentos_agricultor_idx ON pagamentos (agricultor_id, status);

-- ----------------------------------------------------------
-- 3. Metodos e status do balcao
-- ----------------------------------------------------------
-- As constraints antigas precisam sair antes: uma linha criada depois
-- deste ponto nao pode mais depender do vocabulario do gateway.
ALTER TABLE pagamentos DROP CONSTRAINT IF EXISTS pagamentos_metodo_valido;
ALTER TABLE pagamentos DROP CONSTRAINT IF EXISTS pagamentos_status_valido;

ALTER TABLE pagamentos
  ADD CONSTRAINT pagamentos_metodo_valido
  CHECK (metodo IN ('PIX', 'CARTAO', 'DINHEIRO'));

ALTER TABLE pagamentos
  ADD CONSTRAINT pagamentos_status_valido
  CHECK (status IN ('PENDENTE', 'PAGO', 'CANCELADO'));

-- O `identificador_externo` tambem sai da lista de campos redigidos no
-- logger (src/config/logger.js): redigir um campo que nao existe mais
-- seria ruido guardado para sempre.
