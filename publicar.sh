#!/usr/bin/env bash
#
# Publica o repositorio AgroHero no GitHub.
#
# Uso:  bash publicar.sh <usuario>/<repositorio>
# Ex.:  bash publicar.sh lucassenderski/agrohero
#
# Requer a variavel GITHUB_TOKEN no ambiente.
# Este script e idempotente: rodar de novo apenas atualiza o remote e
# envia o que estiver faltando.

set -u

REPO="${1:-}"
if [ -z "$REPO" ]; then
  echo "Informe o repositorio: bash publicar.sh usuario/repositorio"
  exit 1
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "GITHUB_TOKEN nao esta definido no ambiente."
  exit 1
fi

echo "==> Verificando se o repositorio existe: $REPO"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/$REPO")

if [ "$STATUS" = "404" ]; then
  echo "O repositorio ainda nao existe."
  echo "Crie em: https://github.com/new  (nome: ${REPO##*/}, sem README)"
  echo "Depois rode este script novamente."
  exit 1
fi

if [ "$STATUS" != "200" ]; then
  echo "Nao foi possivel consultar o repositorio (HTTP $STATUS)."
  exit 1
fi

echo "==> Repositorio encontrado. Configurando o remote..."
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$REPO.git"

echo "==> Enviando o historico..."
git push -u origin master

echo
echo "==> Concluido: https://github.com/$REPO"
