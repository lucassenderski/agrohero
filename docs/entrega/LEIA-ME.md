# Atividade Extensionista III — material de entrega

Relatório de **Evolução e Gerenciamento do Projeto AgroHero**, com os itens escolhidos:
processo de gerenciamento, controle de configuração (GitHub), plano de gerenciamento de
configuração, métricas (SLOC/KSLOC), qualidade do software e evolução do projeto — além
da implantação, exigida para os cursos de três Atividades Extensionistas.

## Arquivos

| Arquivo | O que é |
|---|---|
| `AE3-Relatorio-AgroHero.pdf` | Versão para entrega (25 páginas, capa inclusa) |
| `AE3-Relatorio-AgroHero.docx` | Versão editável, mesmo conteúdo |
| `AE3-Relatorio.md` | Fonte em Markdown — é daqui que as duas acima são geradas |
| `gerar-docx.py` | Gera o DOCX a partir do Markdown |
| `gerar-pdf.py` | Gera o HTML; o PDF sai da impressão do HTML no Chromium |

## O que preencher antes de entregar

Os trechos entre colchetes são os únicos pontos que dependem de informação do aluno:

1. **Capa e tabela de identificação** — `[NOME DA INSTITUIÇÃO DE ENSINO]`, `[CURSO]`,
   `[CIDADE]` e `[preencher: polo / cidade / mês / ano]`.
2. **Curso** — a linha de identificação lista as três opções; deixar apenas a sua.

Basta editar o `.md` e regerar, ou editar direto no Word.

## Como regerar os arquivos

```bash
pip install python-docx markdown

# DOCX
python3 docs/entrega/gerar-docx.py docs/entrega/AE3-Relatorio.md docs/entrega/AE3-Relatorio-AgroHero.docx

# HTML -> PDF (o Chromium imprime em A4 com as margens da ABNT)
python3 docs/entrega/gerar-pdf.py docs/entrega/AE3-Relatorio.md /tmp/AE3.html
chromium --headless --no-sandbox --no-pdf-header-footer \
  --print-to-pdf=docs/entrega/AE3-Relatorio-AgroHero.pdf file:///tmp/AE3.html
```

## Números citados no relatório

Todos foram medidos no repositório, no commit `222beec` (main). Para reconferir:

| Métrica | Valor | Como reconferir |
|---|---|---|
| SLOC total | 28.450 | contagem de linhas sem branco/comentário em `backend/`, `frontend/` |
| KSLOC | 28,45 | SLOC / 1000 |
| Testes backend | 630 | `cd backend && npm test` |
| Testes frontend | 62 | `cd frontend && npx vitest run` |
| Cobertura de instruções | 83,09 % | `cd backend && npm run test:coverage` |
| Endpoints | 48 | `backend/src/docs/openapi.js` |
| Migrations | 10 | `backend/src/database/migrations/` |
| Commits na AE III | 40 | `git rev-list --count c2a97a3..HEAD` |
| Pull requests | 11 | `gh pr list --state all` |

> Os testes exigem o PostgreSQL no ar. O backend em modo de teste é necessário antes da
> suíte do frontend, e as categorias precisam ser resemeadas entre as duas suítes —
> detalhes no `AGENTS.md`, seção de armadilhas.
