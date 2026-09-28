import usuarioRepository from '../repositories/usuarioRepository.js';
import agricultorRepository from '../repositories/agricultorRepository.js';
import { gerarHashSenha, conferirSenha } from '../utils/senha.js';
import { erros } from '../utils/AppError.js';
import { processarLogo, processarAvatar } from './imagemService.js';
import { comAvatarUrl } from '../utils/avatar.js';
import logger from '../config/logger.js';

/*
 * Regras de negocio do usuario autenticado.
 *
 * Toda funcao daqui recebe o id do usuario vindo do TOKEN (req.usuario.id),
 * nunca de um parametro de rota. Nao existe metodo "buscar perfil de
 * qualquer id" nesta camada de proposito: o unico jeito de ler ou alterar
 * um perfil e sendo o dono dele. Isso elimina a classe IDOR por
 * construcao, em vez de depender de uma checagem que alguem pode
 * esquecer de escrever.
 */

/* Perfil completo do usuario logado, com dados do produtor quando houver. */
export async function obterPerfil(usuarioId) {
  const usuario = await usuarioRepository.buscarPorId(usuarioId);

  if (!usuario) {
    // Pode acontecer se a conta for removida entre a validacao do token
    // e esta consulta.
    throw erros.naoEncontrado('Usuario');
  }

  if (!usuario.ativo) {
    throw erros.semPermissao('Esta conta esta bloqueada.');
  }

  /*
   * `avatar_url` e derivado de `tem_avatar` pelo util compartilhado, para
   * que login, cadastro e perfil tenham exatamente o mesmo formato (ver a
   * nota em utils/avatar.js).
   */
  const resposta = { ...comAvatarUrl(usuario), agricultor: null };

  // So busca o perfil de produtor quando faz sentido, para nao pagar um
  // JOIN desnecessario em toda leitura de perfil de cliente.
  if (usuario.tipo === 'agricultor') {
    const perfil = await agricultorRepository.buscarPorUsuarioId(usuarioId);
    resposta.agricultor = perfil
      ? {
          id: perfil.id,
          nome_fazenda: perfil.nome_fazenda,
          descricao: perfil.descricao,
          historia: perfil.historia,
          cidade: perfil.cidade,
          estado: perfil.estado,
          endereco: perfil.endereco,
          certificacoes: perfil.certificacoes,
          imagem_url: perfil.imagem_url,
          logo_url: perfil.tem_logo ? `/agricultores/${perfil.id}/logo` : null,
          ativo: perfil.ativo,
        }
      : null;
  }

  return resposta;
}

/*
 * Atualiza os dados de perfil do proprio usuario.
 *
 * Repare que e-mail e tipo NAO estao aqui:
 *   - e-mail: alterar exige confirmacao (seria um vetor de sequestro de
 *     conta se a troca valesse sem verificar o novo endereco);
 *   - tipo: mudar o proprio tipo seria escalacao de privilegio direta.
 * Se um dia forem implementados, serao fluxos separados e auditaveis.
 */
export async function atualizarPerfil(usuarioId, dados) {
  const existente = await usuarioRepository.buscarPorId(usuarioId);

  if (!existente) {
    throw erros.naoEncontrado('Usuario');
  }

  const atualizado = await usuarioRepository.atualizar(usuarioId, dados);

  // Quando o usuario e agricultor, atualiza tambem o perfil publico, na
  // mesma chamada. Sem isso, o produtor teria que editar em duas telas
  // para corrigir a cidade da propriedade.
  if (existente.tipo === 'agricultor' && dados.agricultor) {
    const perfil = await agricultorRepository.buscarPorUsuarioId(usuarioId);

    if (perfil) {
      await agricultorRepository.atualizar(perfil.id, {
        nomeFazenda: dados.agricultor.nome_fazenda,
        descricao: dados.agricultor.descricao,
        historia: dados.agricultor.historia,
        cidade: dados.agricultor.cidade,
        estado: dados.agricultor.estado,
        endereco: dados.agricultor.endereco,
        certificacoes: dados.agricultor.certificacoes,
      });
    }
  }

  logger.info({ usuarioId }, 'Perfil atualizado');

  return atualizado;
}

/*
 * Define a logo da propriedade a partir do arquivo enviado.
 *
 * Fluxo: identifica o produtor pelo TOKEN (nunca por um id do corpo, que
 * seria o caminho classico de IDOR), processa a imagem e grava os bytes.
 *
 * O processamento vem ANTES de qualquer escrita: se a imagem for
 * recusada, nenhuma linha foi tocada e o produtor mantem a logo que ja
 * tinha. Gravar primeiro e validar depois deixaria o perfil sem logo
 * quando o arquivo fosse invalido.
 */
export async function salvarLogo(usuarioId, arquivo) {
  const perfil = await agricultorRepository.buscarPorUsuarioId(usuarioId);

  if (!perfil) {
    // Acontece quando o token diz "agricultor" mas o perfil nao existe
    // (dado inconsistente). 404 e a resposta honesta: nao ha propriedade
    // para receber a logo.
    throw erros.naoEncontrado('Perfil de produtor');
  }

  const { bytes, mime } = await processarLogo(arquivo?.buffer);

  await agricultorRepository.salvarLogo(perfil.id, { bytes, mime });

  logger.info(
    { usuarioId, agricultorId: perfil.id, bytes: bytes.length },
    'Logo da propriedade atualizada',
  );

  return {
    logo_url: `/agricultores/${perfil.id}/logo`,
    bytes: bytes.length,
    mime,
  };
}

/* Remove a logo enviada e volta para a imagem padrao. */
export async function removerLogo(usuarioId) {
  const perfil = await agricultorRepository.buscarPorUsuarioId(usuarioId);

  if (!perfil) {
    throw erros.naoEncontrado('Perfil de produtor');
  }

  await agricultorRepository.limparLogo(perfil.id);

  logger.info({ usuarioId, agricultorId: perfil.id }, 'Logo da propriedade removida');

  return { logo_url: null };
}

/*
 * Avatar do usuario.
 *
 * Diferente da logo, que e do produtor, o avatar e de QUALQUER conta -
 * cliente, produtor ou administrador. Por isso a rota nao tem
 * requireRole: toda conta autenticada tem uma foto de perfil para
 * escolher. A identidade continua vindo do token, nunca do corpo.
 *
 * O processamento vem antes da escrita, pela mesma razao da logo: uma
 * imagem recusada nao pode deixar a conta sem o avatar que ja tinha.
 */
export async function salvarAvatar(usuarioId, arquivo) {
  const existente = await usuarioRepository.buscarPorId(usuarioId);

  if (!existente) {
    throw erros.naoEncontrado('Usuario');
  }

  const { bytes, mime } = await processarAvatar(arquivo?.buffer);

  await usuarioRepository.salvarAvatar(usuarioId, { bytes, mime });

  logger.info({ usuarioId, bytes: bytes.length }, 'Avatar atualizado');

  return {
    /*
     * Caminho RELATIVO, como na logo. A URL nao inclui o id do usuario
     * porque so existe uma rota: a do proprio dono (ver `obterAvatar`).
     */
    avatar_url: '/usuarios/avatar',
    bytes: bytes.length,
    mime,
  };
}

/* Remove o avatar; a interface volta a exibir as iniciais. */
export async function removerAvatar(usuarioId) {
  const existente = await usuarioRepository.buscarPorId(usuarioId);

  if (!existente) {
    throw erros.naoEncontrado('Usuario');
  }

  await usuarioRepository.limparAvatar(usuarioId);

  logger.info({ usuarioId }, 'Avatar removido');

  return { avatar_url: null };
}

/*
 * Le o avatar para servir ao dono.
 *
 * NAO EXISTE rota publica de avatar, e a ausencia e a decisao - nao um
 * esquecimento. As avaliacoes publicas expoem apenas o primeiro nome de
 * quem comprou (ver `avaliacaoRepository.js`), para nao ligar uma pessoa
 * a uma compra. Uma foto de rosto indexada por id de usuario seria um
 * identificador mais forte que o nome que o projeto limitou de proposito,
 * e os ids sao sequenciais - o que tornaria a enumeracao trivial.
 *
 * Entao o dono ve a propria foto, e nas telas de terceiros aparecem as
 * iniciais com a cor derivada do nome (ver `Avatar.jsx`).
 */
export async function obterAvatar(usuarioId) {
  const avatar = await usuarioRepository.buscarAvatar(usuarioId);

  if (!avatar) {
    throw erros.naoEncontrado('Avatar');
  }

  return avatar;
}

/*
 * Troca a senha do usuario logado.
 *
 * Exige a senha ATUAL mesmo com o usuario ja autenticado. Motivo: se o
 * token vazar (computador compartilhado, XSS), o atacante poderia trocar
 * a senha e tomar a conta permanentemente. Pedir a senha atual limita o
 * estrago do token vazado ao periodo de validade dele.
 */
export async function trocarSenha(usuarioId, { senhaAtual, novaSenha }) {
  const usuario = await usuarioRepository.buscarPorIdComSenha(usuarioId);

  if (!usuario) {
    throw erros.naoEncontrado('Usuario');
  }

  if (!(await conferirSenha(senhaAtual, usuario.senha_hash))) {
    // 401 e nao 403: o problema e a credencial apresentada, nao a permissao.
    throw erros.credenciaisInvalidas('A senha atual esta incorreta.');
  }

  if (await conferirSenha(novaSenha, usuario.senha_hash)) {
    throw erros.regraNegocio(
      'A nova senha deve ser diferente da atual.',
      'SENHA_REPETIDA',
    );
  }

  await usuarioRepository.atualizarSenha(usuarioId, await gerarHashSenha(novaSenha));

  logger.info({ usuarioId }, 'Senha alterada');
}

export default {
  obterPerfil,
  atualizarPerfil,
  trocarSenha,
  salvarLogo,
  removerLogo,
  salvarAvatar,
  removerAvatar,
  obterAvatar,
};
