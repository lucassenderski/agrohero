/*
 * Utilitarios de SQL compartilhados entre repositorios.
 *
 * Estes helpers existem para que a mesma regra nao seja reescrita em
 * cada repositorio. A regra de escape abaixo ja precisou valer para
 * agricultores (FASE 6) e produtos (FASE 8) - duas copias divergiriam
 * na primeira correcao aplicada so em uma delas.
 */

/*
 * Escapa os curingas do LIKE no termo de busca.
 *
 * O problema que isto resolve: em SQL, `%` e `_` sao curingas do LIKE.
 * Se o termo do usuario for interpolado direto no padrao, procurar por
 * "100%" vira o padrao `%100%%`, que casa com qualquer nome contendo
 * "100" - o usuario pede um filtro especifico e recebe resultados que
 * nao tem nada a ver, sem entender por que.
 *
 * A ORDEM das substituicoes importa: a barra invertida precisa ser
 * escapada PRIMEIRO. Se fosse por ultimo, as barras que acabamos de
 * inserir para escapar `%` e `_` seriam escapadas de novo e virariam
 * `\\%`, que o LIKE le como "barra literal seguida de curinga" - o
 * escape deixaria de funcionar.
 *
 * Requer que a consulta use `ESCAPE '\'`, que e o padrao do PostgreSQL,
 * mas declaramos explicitamente na query para nao depender do default.
 */
export function escaparTermoBusca(termo) {
  return termo.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export default { escaparTermoBusca };
