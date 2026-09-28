import sharp from 'sharp';
import { erros } from '../utils/AppError.js';

/*
 * Processador da logo da propriedade.
 *
 * Este arquivo e o unico ponto que transforma um arquivo enviado pelo
 * usuario em bytes que vao para o banco. Como o banco do Neon e o
 * recurso escasso (0,5 GB no plano gratuito), e aqui que o tamanho e
 * contido - nao na borda, onde a extensao e o mimetype mentem.
 *
 * A ORDEM DAS DEFESAS IMPORTA
 *
 *   1. teto de bytes de ENTRADA, antes de decodificar;
 *   2. reconhecimento do formato pelos BYTES (nao pela extensao), com
 *      lista branca fechada;
 *   3. reamostragem para no maximo 800x800;
 *   4. reencode em WebP com qualidade em degraus, ate caber no alvo.
 *
 * Por que a defesa 2 existe, e nao so a 1: um "decompression bomb" e um
 * arquivo pequeno que expande para um bitmap gigante ao ser decodificado
 * - um PNG de poucos KB pode virar dezenas de GB na memoria. A extensao
 * nao revela isso; os magic bytes, sim. Ler o cabecalho e recusar antes
 * de chamar o decoder evita o consumo de memoria.
 */

/* Formatos aceitos. Lista branca fechada: qualquer outro e recusado. */
export const FORMATOS_ACEITOS = Object.freeze(['jpeg', 'png', 'webp']);

/* Teto do arquivo enviado. Acima disso nem tentamos decodificar. */
export const LIMITE_ENTRADA_BYTES = 5 * 1024 * 1024;

/* Alvo do arquivo final. O teto do banco (512 KB) da margem sobre isto. */
const ALVO_SAIDA_BYTES = 200 * 1024;

/*
 * Teto absoluto do que pode ser gravado.
 *
 * Igual ao da constraint `agricultores_logo_tamanho`. Serve para que um
 * estouro vire um erro claro aqui, e nao uma violacao de check vinda do
 * Postgres - que o errorHandler transformaria em 500 sem dizer ao usuario
 * o que aconteceu.
 */
const TETO_SAIDA_BYTES = 512 * 1024;

/* Lado maior da imagem processada. */
const LADO_MAXIMO = 800;

/*
 * Orcamento de pixels do arquivo de entrada.
 *
 * Defesa contra "decompression bomb": um arquivo de poucos KB que declara
 * dimensoes gigantes e expande para um bitmap enorme ao ser decodificado
 * (o caso ilustre e um PNG de 4 KB que vira 48 GB na memoria). O teto de
 * bytes de entrada NAO pega isso - o arquivo e pequeno. 50 megapixels
 * cobre com folga qualquer camera de celular (uma de 108 MP passa, mas e
 * o limite da categoria) e ainda barra o caso absurdo antes do decoder
 * alocar memoria.
 */
const MAX_PIXELS = 50 * 1000 * 1000;

/*
 * Qualidades tentadas em ordem. A primeira que couber no alvo vence.
 *
 * A escada vai ate 45 porque o alvo tem de ser alcancavel no PIOR caso.
 * Medido com ruido puro (incompressivel) a 800x800: q82 -> 284 KB,
 * q62 -> ~210 KB, q45 -> 173 KB. Uma foto real comprime bem melhor
 * (~150 KB em q82), mas a escada precisa funcionar tambem quando nao
 * comprime - senao o alvo seria apenas uma esperanca.
 *
 * Comecar em 82 e nao em 100 e deliberado: uma logo exibida a 200 px nao
 * se beneficia de qualidade 100, e o arquivo seria varias vezes maior
 * pelo mesmo resultado visual.
 */
const QUALIDADES = [82, 72, 62, 52, 45];

/* Cabecalhos magicos. Comparados com o inicio do buffer, sem olhar a extensao. */
function reconhecerFormato(buffer) {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e &&
    buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a &&
    buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return 'png';
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }

  return null;
}

/*
 * Redimensiona para um quadrado de lado `lado`, com recorte central.
 *
 * Por que nao usar `withoutEnlargement` aqui: ele impede o upscale de
 * QUALQUER eixo, e com `fit: 'cover'` isso anula o recorte. Medido: uma
 * imagem 1200x400 com alvo 800 e `withoutEnlargement` sai 800x400 - nao
 * quadrada, que e exatamente o que o card espera. Entao o lado alvo e
 * calculado antes como `min(LADO_MAXIMO, menor lado da imagem)`, e o
 * upscale nunca acontece porque o alvo ja nasce menor que a imagem.
 */
function ladoAlvo(metadados) {
  const menorLado = Math.min(metadados.width, metadados.height);
  return Math.max(1, Math.min(LADO_MAXIMO, menorLado));
}

/*
 * Processa o arquivo e devolve os bytes prontos para gravar.
 *
 * Recebe o buffer cru do multer (memoryStorage) e devolve
 * `{ bytes, mime }`. Lanca AppError 422 quando o arquivo nao serve.
 */
export async function processarLogo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw erros.dadosInvalidos('Nenhum arquivo foi recebido.');
  }

  if (buffer.length > LIMITE_ENTRADA_BYTES) {
    const mb = (LIMITE_ENTRADA_BYTES / 1024 / 1024).toFixed(0);
    // Mensagem acionavel: o usuario quase sempre enviou uma foto de
    // celular e pode resolver sozinho, reduzindo antes de enviar.
    throw erros.regraNegocio(
      `A imagem tem ${(buffer.length / 1024 / 1024).toFixed(1)} MB e o limite e ${mb} MB. ` +
        'Reduza a imagem e tente novamente.',
      'LOGO_MUITO_GRANDE',
    );
  }

  const formato = reconhecerFormato(buffer);

  if (!formato || !FORMATOS_ACEITOS.includes(formato)) {
    throw erros.regraNegocio(
      `Formato nao aceito. Envie uma imagem ${FORMATOS_ACEITOS.join(', ')}.`,
      'LOGO_FORMATO_INVALIDO',
    );
  }

  /*
   * TODO o trabalho do sharp fica dentro deste try.
   *
   * O sharp e "lazy": construir o pipeline (`sharp(buffer)`) nao decodifica
   * nada - o erro de um arquivo corrompido so aparece no primeiro
   * `toBuffer()`/`metadata()`. Envolver apenas a construcao deixaria o erro
   * cru vazar como 500. Foi o que aconteceu antes de separar assim: uma
   * imagem truncada respondia erro interno em vez de "arquivo corrompido".
   */
  let bytes = null;
  let lado = null;

  try {
    const metadados = await sharp(buffer, { limitInputPixels: MAX_PIXELS }).metadata();

    if (!metadados.width || !metadados.height) {
      throw erros.regraNegocio(
        'Nao foi possivel ler as dimensoes da imagem.',
        'LOGO_ILEGIVEL',
      );
    }

    lado = ladoAlvo(metadados);

    /*
     * `rotate()` sem argumento aplica a orientacao EXIF e depois a
     * descarta. Sem isso, a foto de um celular em modo retrato chega
     * deitada - a orientacao vive no EXIF, que o reencode nao preserva.
     */
    const base = sharp(buffer, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize(lado, lado, { fit: 'cover', position: 'centre' });

    /*
     * A escada de qualidade: tenta a melhor e vai descendo ate caber no
     * alvo. `base.clone()` e obrigatorio - um pipeline do sharp e
     * consumido pelo primeiro `toBuffer()`, e reusar o mesmo objeto na
     * segunda tentativa falharia.
     */
    for (const qualidade of QUALIDADES) {
      const candidato = await base.clone().webp({ quality: qualidade }).toBuffer();

      if (!bytes || candidato.length < bytes.length) bytes = candidato;
      if (candidato.length <= ALVO_SAIDA_BYTES) break;
    }
  } catch (erro) {
    // Ja e um erro nosso (dimensoes ilegiveis): propaga como veio.
    if (erro?.ehOperacional) throw erro;

    /*
     * Erro do sharp: arquivo corrompido ou pixels acima do orcamento.
     * Nao vaza a mensagem original para o cliente - ela cita o decoder
     * interno (nome da lib, versao). O detalhe fica no log.
     */
    throw erros.regraNegocio(
      'Nao foi possivel ler a imagem. O arquivo pode estar corrompido.',
      'LOGO_ILEGIVEL',
      { causa: erro.message },
    );
  }

  /*
   * Rede de seguranca final. Se nem a qualidade minima coube no alvo,
   * ainda assim nao gravamos acima do teto da constraint - seria trocar
   * um 422 claro por um 500 do Postgres.
   */
  if (!bytes || bytes.length > TETO_SAIDA_BYTES) {
    throw erros.regraNegocio(
      'Nao foi possivel reduzir a imagem o suficiente. Tente outra imagem.',
      'LOGO_NAO_REDUZIU',
    );
  }

  return { bytes, mime: 'image/webp', formatoEntrada: formato, lado };
}

export default { processarLogo, FORMATOS_ACEITOS, LIMITE_ENTRADA_BYTES };
