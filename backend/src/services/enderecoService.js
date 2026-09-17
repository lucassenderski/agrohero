import enderecoRepository from '../repositories/enderecoRepository.js';
import { erros } from '../utils/AppError.js';
import logger from '../config/logger.js';

/*
 * Regras de negocio dos enderecos de entrega.
 *
 * Todo metodo recebe o usuario autenticado e opera SEMPRE sobre os
 * enderecos dele. O id do endereco nunca e suficiente por si so: as
 * consultas do repositorio filtram por `consumidor_id` em toda operacao.
 *
 * Sem isso, um cliente que descobrisse o id de um endereco alheio
 * poderia ler os dados pessoais de outro (nome completo, CEP, rua,
 * numero) e ate usar esse endereco como destino de uma compra.
 */

/* Limite de enderecos por consumidor, para nao virar base de dados. */
const MAXIMO_ENDERECOS = 20;

function paraRepositorio(dados) {
  return {
    nomeDestinatario: dados.nome_destinatario,
    cep: dados.cep,
    rua: dados.rua,
    numero: dados.numero,
    complemento: dados.complemento ?? null,
    bairro: dados.bairro,
    cidade: dados.cidade,
    estado: dados.estado,
  };
}

/* Lista os enderecos do consumidor. */
export async function listar(usuario) {
  return enderecoRepository.listarDoConsumidor(usuario.id);
}

/* Detalhe de um endereco do consumidor. */
export async function obter(usuario, enderecoId) {
  const endereco = await enderecoRepository.buscarDoConsumidor(usuario.id, enderecoId);

  if (!endereco) {
    /*
     * 404 tanto para "nao existe" quanto para "e de outro consumidor".
     * Distinguir os dois confirmaria a existencia do endereco alheio -
     * informacao que nao deve sair daqui.
     */
    throw erros.naoEncontrado('Endereco');
  }

  return endereco;
}

/* Cria um endereco. O primeiro vira principal automaticamente. */
export async function criar(usuario, dados) {
  const total = await enderecoRepository.contarDoConsumidor(usuario.id);

  if (total >= MAXIMO_ENDERECOS) {
    throw erros.regraNegocio(
      `Voce ja tem ${MAXIMO_ENDERECOS} enderecos cadastrados. Remova um para adicionar outro.`,
      'LIMITE_ENDERECOS',
    );
  }

  const endereco = await enderecoRepository.criar(usuario.id, paraRepositorio(dados));

  logger.info({ usuarioId: usuario.id, enderecoId: endereco.id }, 'Endereco criado');

  return endereco;
}

/* Atualiza um endereco do consumidor. */
export async function atualizar(usuario, enderecoId, dados) {
  const endereco = await enderecoRepository.atualizar(
    usuario.id,
    enderecoId,
    paraRepositorio(dados),
  );

  if (!endereco) {
    throw erros.naoEncontrado('Endereco');
  }

  logger.info({ usuarioId: usuario.id, enderecoId }, 'Endereco atualizado');

  return endereco;
}

/* Define o endereco como principal. */
export async function definirPrincipal(usuario, enderecoId) {
  const endereco = await enderecoRepository.definirPrincipal(usuario.id, enderecoId);

  if (!endereco) {
    throw erros.naoEncontrado('Endereco');
  }

  logger.info({ usuarioId: usuario.id, enderecoId }, 'Endereco principal alterado');

  return endereco;
}

/*
 * Remove um endereco.
 *
 * REGRA: nao permite remover o ultimo endereco. Um cliente sem nenhum
 * endereco nao consegue finalizar uma compra, e descobrir isso no
 * checkout e pior que descobrir na hora de remover. Tambem nao permite
 * remover o principal enquanto houver outros: o padrao de entrega
 * ficaria indefinido.
 */
export async function remover(usuario, enderecoId) {
  const endereco = await enderecoRepository.buscarDoConsumidor(usuario.id, enderecoId);

  if (!endereco) {
    throw erros.naoEncontrado('Endereco');
  }

  const total = await enderecoRepository.contarDoConsumidor(usuario.id);

  if (total === 1) {
    throw erros.regraNegocio(
      'Voce precisa manter ao menos um endereco de entrega para poder comprar.',
      'ULTIMO_ENDERECO',
    );
  }

  if (endereco.principal) {
    throw erros.regraNegocio(
      'Defina outro endereco como principal antes de remover este.',
      'ENDERECO_PRINCIPAL',
    );
  }

  await enderecoRepository.remover(usuario.id, enderecoId);

  logger.info({ usuarioId: usuario.id, enderecoId }, 'Endereco removido');

  return true;
}

export default { listar, obter, criar, atualizar, definirPrincipal, remover };
