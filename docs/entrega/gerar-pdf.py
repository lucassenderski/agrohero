#!/usr/bin/env python3
"""Gera HTML estilizado (ABNT simplificado) a partir do Markdown do relatorio."""
import sys
import markdown

ENTRADA = sys.argv[1] if len(sys.argv) > 1 else 'docs/entrega/AE3-Relatorio.md'
SAIDA = sys.argv[2] if len(sys.argv) > 2 else 'AE3-Relatorio.html'

CSS = """
@page { size: A4; margin: 3cm 2cm 2cm 3cm; }
* { box-sizing: border-box; }
body {
  font-family: "Times New Roman", Times, serif;
  font-size: 12pt; line-height: 1.5; color: #111; margin: 0;
  text-align: justify; hyphens: auto;
}
h1, h2, h3, h4 { font-family: "Times New Roman", Times, serif; color: #1b1b1b; text-align: left; page-break-after: avoid; }
h1 { font-size: 15pt; margin: 26px 0 10px; border-bottom: 2px solid #2e7d32; padding-bottom: 4px; page-break-before: always; }
h2 { font-size: 13.5pt; margin: 20px 0 8px; }
h3 { font-size: 12.5pt; margin: 16px 0 6px; }
h4 { font-size: 12pt; margin: 14px 0 6px; }
p { margin: 0 0 10px; }
ul, ol { margin: 0 0 10px; padding-left: 24px; }
li { margin-bottom: 4px; }
code { font-family: "Courier New", monospace; font-size: 10pt; background: #f2f2f2; padding: 1px 3px; border-radius: 3px; }
pre { background: #f5f5f5; border-left: 3px solid #2e7d32; padding: 10px 12px; overflow-x: auto; page-break-inside: avoid; }
pre code { background: none; font-size: 9.5pt; line-height: 1.35; }
blockquote { margin: 12px 0; padding: 8px 14px; border-left: 3px solid #999; background: #fafafa; font-style: italic; font-size: 11pt; }
table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 10.5pt; page-break-inside: avoid; }
th, td { border: 1px solid #bbb; padding: 5px 7px; text-align: left; vertical-align: top; }
th { background: #eaeaea; font-weight: bold; }
tr:nth-child(even) td { background: #fafafa; }
hr { border: none; border-top: 1px solid #ddd; margin: 18px 0; }
a { color: #1a4f8a; text-decoration: none; word-break: break-all; }
/* Capa */
.capa { text-align: center; page-break-after: always; line-height: 1.5; }
.capa .inst { font-weight: bold; font-size: 12pt; }
.capa .espaco { height: 60px; }
.capa .espaco-g { height: 130px; }
.capa .titulo { font-weight: bold; font-size: 14pt; }
.capa .subtitulo { font-size: 12pt; }
.capa .tema { font-weight: bold; font-size: 13pt; margin-top: 6px; }
"""

CAPA = """
<div class="capa">
  <div class="inst">[NOME DA INSTITUIÇÃO DE ENSINO]</div>
  <div>[CURSO]</div>
  <div>&nbsp;</div>
  <div>Lucas Senderski</div>
  <div>RU: 4758862</div>
  <div class="espaco"></div>
  <div class="espaco-g"></div>
  <div class="titulo">ATIVIDADE EXTENSIONISTA III</div>
  <div class="subtitulo">Tecnologia Aplicada à Inclusão Digital — Análise</div>
  <div class="tema">Evolução e Gerenciamento do Projeto AgroHero</div>
  <div class="espaco-g"></div>
  <div class="espaco-g"></div>
  <div>[CIDADE]</div>
  <div>2026</div>
</div>
"""


def main():
    texto = open(ENTRADA, encoding='utf-8').read()
    corpo = markdown.markdown(
        texto,
        extensions=['tables', 'fenced_code', 'sane_lists', 'nl2br'],
    )
    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Atividade Extensionista III — AgroHero</title>
<style>{CSS}</style></head>
<body>{CAPA}{corpo}</body></html>"""
    open(SAIDA, 'w', encoding='utf-8').write(html)
    print(f'Gerado: {SAIDA}')


if __name__ == '__main__':
    main()
