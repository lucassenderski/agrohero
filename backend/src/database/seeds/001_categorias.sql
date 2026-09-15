-- ==========================================================
-- Seeds - categorias iniciais
-- ==========================================================
-- Idempotente: ON CONFLICT DO NOTHING permite rodar varias vezes sem
-- erro e sem duplicar categoria. Isso torna o seed seguro para rodar
-- no deploy (a cada novo ambiente) sem precisar de controle externo.

INSERT INTO categorias (nome, slug, descricao) VALUES
  ('Frutas',     'frutas',     'Frutas frescas colhidas na propriedade.'),
  ('Verduras',   'verduras',   'Folhas e verduras do dia.'),
  ('Legumes',    'legumes',    'Legumes variados, por quilo ou unidade.'),
  ('Graos',      'graos',      'Arroz, feijao, milho e outros graos.'),
  ('Ovos',       'ovos',       'Ovos de galinha caipira e de outras aves.'),
  ('Laticinios', 'laticinios', 'Leite, queijo, iogurte e derivados.'),
  ('Outros',     'outros',     'Mel, conservas, doces e demais produtos.')
ON CONFLICT (slug) DO NOTHING;