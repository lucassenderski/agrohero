import multer from 'multer';
import { erros } from '../utils/AppError.js';
import { LIMITE_ENTRADA_BYTES } from '../services/logoService.js';

/*
 * Middleware de upload de arquivo (multipart/form-data).
 *
 * POR QUE ESTE MIDDLEWARE E SEPARADO DO VALIDADOR ZOD
 *
 * O resto da API recebe JSON e valida com zod em `middlewares/validar.js`.
 * Um arquivo nao passa por ali: `express.json` nao parseia
 * multipart/form-data, entao o corpo chega vazio para o zod e a validacao
 * falharia por um motivo que nao tem nada a ver com o arquivo. O multer e
 * quem le o multipart e preenche `req.file` / `req.body`.
 *
 * ORDEM: o multer roda ANTES do controller, que so ve `req.file`.
 *
 * MEMORIA, E NAO DISCO
 *
 * `memoryStorage` mantem o arquivo em memoria e nunca toca o filesystem.
 * Dois motivos:
 *
 *   1. o disco do Render (plano gratuito) e efemero - um arquivo
 *      temporario gravado ali pode sumir no meio do processamento;
 *   2. o nome do arquivo enviado nunca vira um caminho. Escrever em disco
 *      exigiria sanitizar nome (traversal, nome reservado, caracteres
 *      invalidos) e ainda assim sobraria um arquivo para limpar em caso
 *      de erro. Em memoria, o buffer morre com a requisicao.
 *
 * O teto de `limits.fileSize` e a primeira barreira: o multer INTERROMPE
 * o recebimento ao passar do limite, entao um corpo de 2 GB nunca chega a
 * ocupar memoria. Sem ele, o limite so seria checado depois, com os bytes
 * ja carregados - tarde demais.
 */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: LIMITE_ENTRADA_BYTES,
    // Um arquivo por requisicao. Sem isto, um envio com varios campos
    // consumiria memoria multiplicada pelo numero de arquivos.
    files: 1,
  },
});

/*
 * Envolve o multer para traduzir os erros dele para o envelope da API.
 *
 * O multer nao lanca AppError: ele chama `next` com um `MulterError` de
 * `code: 'LIMIT_FILE_SIZE'`. Sem esta traducao, o errorHandler generico
 * responderia 500 com "Erro interno do servidor" - e o produtor que
 * enviou uma foto de 8 MB veria uma falha de servidor em vez de
 * "a imagem e grande demais".
 */
function traduzirErro(erro, res, next) {
  if (erro instanceof multer.MulterError) {
    if (erro.code === 'LIMIT_FILE_SIZE') {
      const mb = (LIMITE_ENTRADA_BYTES / 1024 / 1024).toFixed(0);
      return next(
        erros.regraNegocio(
          `A imagem e maior que o limite de ${mb} MB. Reduza a imagem e tente novamente.`,
          'LOGO_MUITO_GRANDE',
        ),
      );
    }

    return next(erros.dadosInvalidos('Envio de arquivo invalido.', { multer: erro.code }));
  }

  return next(erro);
}

/*
 * Recebe um unico arquivo no campo informado.
 *
 * `arquivoObrigatorio` existe para reusar o mesmo middleware em rotas em
 * que o arquivo e opcional. Aqui ele e obrigatorio: a rota so existe para
 * trocar a logo, entao uma requisicao sem arquivo e um erro do cliente.
 */
export function uploadArquivo(campo = 'logo') {
  const middleware = upload.single(campo);

  return function uploadMiddleware(req, res, next) {
    middleware(req, res, (erro) => {
      if (erro) return traduzirErro(erro, res, next);

      // Sem `req.file`, o service lancaria DADOS_INVALIDOS de forma
      // generica. Uma mensagem especifica aqui diz ao frontend qual
      // campo faltou.
      if (!req.file) {
        return next(
          erros.dadosInvalidos('Nenhum arquivo foi enviado no campo "logo".'),
        );
      }

      return next();
    });
  };
}

export default uploadArquivo;
