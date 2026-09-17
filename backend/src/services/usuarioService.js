import usuarioRepository from '../repositories/usuarioRepository.js';
import agricultorRepository from '../repositories/agricultorRepository.js';
import { gerarHashSenha, conferirSenha } from '../utils/senha.js';
import { erros } from '../utils/AppError.js';
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

  const resposta = { ...usuario, agricultor: null };

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

export default { obterPerfil, atualizarPerfil, trocarSenha };
