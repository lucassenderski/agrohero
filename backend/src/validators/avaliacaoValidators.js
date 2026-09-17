import { z } from 'zod';
import { idParametro, nota } from '../utils/validacao.js';

/*
 * Schemas de avaliacoes.
 *
 * O QUE NAO EXISTE AQUI E O PONTO PRINCIPAL.
 *
 * O corpo de criacao aceita quatro campos: `pedido_id`, `produto_id`,
 * `nota` e `comentario`. Nao existe `consumidor_id` nem `agricultor_id`.
 *
 * `consumidor_id` viria do token. Aceita-lo do corpo permitiria escrever
 * uma avaliacao em nome de outra pessoa.
 *
 * `agricultor_id` e derivado de `pedido_itens`. Aceita-lo do corpo
 * permitiria atribuir a nota a um produtor diferente do que vendeu - o
 * cliente compraria do produtor A (que entrega bem) e daria nota 1 ao
 * produtor B (concorrente). Como o Zod descarta campos nao declarados,
 * essa manipulacao nao tem por onde entrar.
 */

/*
 * Comentario.
 *
 * Aceita `null` explicitamente, e isso e o que permite APAGAR um
 * comentario. A distincao que o schema precisa representar tem tres
 * estados:
 *
 *   campo ausente  -> nao mexe no comentario
 *   null ou ""     -> apaga o comentario
 *   texto          -> grava o texto
 *
 * Nao da para usar `textoOpcional` aqui: ele transforma "" em
 * `undefined`, o que colapsaria "apagar" e "nao enviado" no mesmo valor
 * e tornaria a remocao do comentario impossivel. O repositorio recebe
 * `comentarioEnviado` para saber diferenciar.
 *
 * O limite de 2000 e o mesmo do CHECK do banco, para a recusa vir como
 * 400 com mensagem clara em vez de 500 por violacao de constraint.
 */
export const comentario = z
  .union([
    z.string().trim().max(2000, 'O comentario deve ter no maximo 2000 caracteres.'),
    z.null(),
  ])
  .optional();

/*
 * Criacao da avaliacao.
 *
 * `nota` reusa o schema compartilhado, que espelha o CHECK
 * `nota BETWEEN 1 AND 5` do banco: validar aqui da 400 com mensagem
 * clara em vez de 500 por violacao de constraint.
 */
export const criarAvaliacaoSchema = z.object({
  pedido_id: idParametro,
  produto_id: idParametro,
  nota,
  comentario,
});

/*
 * Atualizacao.
 *
 * `pedido_id` e `produto_id` NAO entram: eles identificam a compra que
 * autorizou a avaliacao, e mudar isso seria reapontar a avaliacao para
 * outra compra. A nota pode ser revista; a origem, nao.
 *
 * Os dois campos sao opcionais para permitir atualizar so o comentario
 * sem reenviar a nota.
 */
export const atualizarAvaliacaoSchema = z
  .object({
    nota: nota.optional(),
    comentario,
  })
  /*
   * Corpo vazio nao e uma atualizacao: seria uma requisicao que nao muda
   * nada e devolve 200, o que confunde o cliente da API. Melhor recusar.
   */
  .refine(
    (dados) => dados.nota !== undefined || Object.hasOwn(dados, 'comentario'),
    { message: 'Informe ao menos um campo para atualizar: nota ou comentario.' },
  );

export const avaliacaoIdParamSchema = z.object({
  id: idParametro,
});

export const produtoIdParamSchema = z.object({
  produtoId: idParametro,
});

export const agricultorIdParamSchema = z.object({
  agricultorId: idParametro,
});

export const pedidoIdParamSchema = z.object({
  pedidoId: idParametro,
});

/* Paginacao das listagens de avaliacao. */
export const listarAvaliacoesQuerySchema = z.object({
  pagina: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().positive().max(100).optional(),
});
