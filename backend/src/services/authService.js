import usuarioRepository from '../repositories/usuarioRepository.js';
import agricultorRepository from '../repositories/agricultorRepository.js';
import { gerarHashSenha, conferirSenha } from '../utils/senha.js';
import { gerarToken } from '../utils/token.js';
import { AppError, erros } from '../utils/AppError.js';
import { TIPOS_AUTOCADASTRO } from '../validators/authValidators.js';
import logger from '../config/logger.js';

/*
 * Regras de negocio de cadastro e login.
 *
 * O service e a unica camada que decide: o controller nao tem regra, o
 * repository nao tem regra. Isso mantem a regra testavel sem HTTP e sem
 * SQL.
 */

/*
 * Hash descartavel usado para igualar o tempo de resposta no login.
 *
 * O PROBLEMA: se o e-mail nao existe, o codigo atual responde sem chamar
 * o bcrypt. Como o bcrypt e lento de proposito (custo 12), existe uma
 * diferenca de tempo enorme entre "e-mail existe" e "e-mail nao existe".
 * Medindo essa diferenca, um atacante consegue descobrir QUAIS e-mails
 * estao cadastrados sem nunca acertar uma senha - e isso ja e um
 * vazamento (permite phishing direcionado e enumeracao de clientes).
 *
 * A SOLUCAO: quando o e-mail nao existe, comparamos a senha enviada com
 * este hash descartavel. O trabalho do bcrypt acontece igual dos dois
 * lados, e o tempo de resposta fica praticamente identico.
 *
 * POR QUE EXPOR ESTE HASH NO CODIGO NAO E UM RISCO:
 *   - ele e o hash de um valor aleatorio de 32 bytes que foi descartado,
 *     entao nao existe senha pre-imagem conhecida;
 *   - mesmo que alguem o leia, nao consegue reverter o bcrypt;
 *   - o resultado da comparacao e sempre falso e e ignorado pelo codigo.
 *
 * Custo 12 e o mesmo de BCRYPT_SALT_ROUNDS, para o tempo bater. Se o
 * custo for alterado no .env, este hash precisa ser regerado com ele.
 */
const HASH_DESCARTAVEL =
  '$2b$12$Ixg13tXXFcvHbs0xxFYCNO.R82nLKjJmHetFlvKRABKm7dHCADhd2';

/* ----------------------------------------------------------
 * Cadastro
 * ---------------------------------------------------------- */

/*
 * Cadastra um usuario novo.
 *
 * Quando o tipo e `agricultor`, o perfil da propriedade e criado na
 * MESMA transacao. Ou nascem os dois, ou nenhum:
 *   - se o INSERT do agricultor falhar, o usuario nao fica orfao no banco;
 *   - se o usuario nao puder ser criado, nao sobra perfil solto.
 * Sem transacao, uma falha no segundo INSERT deixaria um usuario do tipo
 * agricultor sem perfil - e o sistema passaria a ter um produtor que nao
 * consegue cadastrar produto nenhum.
 */
export async function cadastrar(dados) {
  /*
   * DEFESA EM PROFUNDIDADE contra escalacao de privilegio.
   *
   * O schema ja rejeita `tipo: 'administrador'`, mas nao confiamos so
   * nisso: o tipo e recalculado aqui a partir de uma lista fixa. Se o
   * schema for alterado no futuro e o enum afrouxar, esta linha continua
   * barrando. Qualquer valor fora da lista vira 'cliente'.
   *
   * Tambem e o ponto que impede que o campo `tipo` vindo do frontend seja
   * usado como veio - o valor do cliente nunca e usado direto.
   */
  const tipo = TIPOS_AUTOCADASTRO.includes(dados.tipo) ? dados.tipo : 'cliente';

  // Checagem de e-mail duplicado amigavel, antes de tentar o INSERT.
  // O indice unico do banco continua sendo a garantia final (ha uma
  // condicao de corrida entre esta consulta e o INSERT, tratada pelo
  // 23505 traduzido no errorHandler).
  if (await usuarioRepository.emailEmUso(dados.email)) {
    throw erros.conflito('Este e-mail ja esta cadastrado.');
  }

  // O hash e gerado ANTES da transacao. O bcrypt leva ~250ms no custo 12;
  // manter essa espera fora da transacao evita segurar uma conexao do
  // pool (e locks) durante o processamento puramente de CPU.
  const senhaHash = await gerarHashSenha(dados.senha);

  const usuario = await usuarioRepository.emTransacao(async (cliente) => {
    const criado = await usuarioRepository.criar(
      {
        nome: dados.nome,
        email: dados.email,
        senhaHash,
        telefone: dados.telefone,
        cidade: dados.cidade,
        estado: dados.estado,
        tipo,
      },
      cliente,
    );

    if (tipo === 'agricultor') {
      await agricultorRepository.criar(
        {
          usuarioId: criado.id,
          nomeFazenda: dados.agricultor.nome_fazenda,
          descricao: dados.agricultor.descricao,
          historia: dados.agricultor.historia,
          // O perfil herda a localizacao do usuario quando nao informada,
          // porque e ela que alimenta o filtro por cidade/estado.
          cidade: dados.agricultor.cidade ?? dados.cidade,
          estado: dados.agricultor.estado ?? dados.estado,
          endereco: dados.agricultor.endereco,
          certificacoes: dados.agricultor.certificacoes,
        },
        cliente,
      );
    }

    return criado;
  });

  logger.info(
    { usuarioId: usuario.id, tipo: usuario.tipo },
    'Novo usuario cadastrado',
  );

  return {
    usuario,
    token: gerarToken(usuario),
  };
}

/* ----------------------------------------------------------
 * Login
 * ---------------------------------------------------------- */

/*
 * Autentica e devolve o usuario + token.
 *
 * DECISAO DE SEGURANCA IMPORTANTE: todas as falhas devolvem exatamente a
 * mesma mensagem ("E-mail ou senha incorretos.") e o mesmo status 401.
 *
 * Se dissessemos "e-mail nao cadastrado" para um caso e "senha incorreta"
 * para outro, o login viraria um oraculo para descobrir quais e-mails
 * existem. Mesma resposta nos dois casos = o atacante nao aprende nada.
 */
export async function login({ email, senha }) {
  const usuario = await usuarioRepository.buscarPorEmailComSenha(email);

  if (!usuario) {
    // Gasta o mesmo tempo do caminho de sucesso (ver HASH_DESCARTAVEL).
    // O retorno e descartado de proposito: nao interessa.
    await conferirSenha(senha, HASH_DESCARTAVEL);
    throw erros.credenciaisInvalidas();
  }

  const senhaConfere = await conferirSenha(senha, usuario.senha_hash);

  if (!senhaConfere) {
    throw erros.credenciaisInvalidas();
  }

  /*
   * Conta bloqueada responde a MESMA mensagem de credencial invalida.
   *
   * Poderiamos dizer "sua conta esta bloqueada", que seria mais util para
   * o usuario legitimo. Mas isso informaria a um atacante que ele acertou
   * a senha e que a conta existe - ou seja, entregaria a ele exatamente o
   * que ele queria saber. O custo de nao explicar e aceitavel: o usuario
   * procura o suporte, que ve o motivo no log.
   */
  if (!usuario.ativo) {
    logger.warn(
      { usuarioId: usuario.id },
      'Tentativa de login em conta bloqueada',
    );
    throw erros.credenciaisInvalidas();
  }

  // Remove o hash antes de devolver. O objeto segue para o controller, e
  // um descuido na montagem da resposta nao pode vazar o hash da senha.
  const { senha_hash: _descartado, ...usuarioSeguro } = usuario;

  logger.info({ usuarioId: usuario.id }, 'Login realizado');

  return {
    usuario: usuarioSeguro,
    token: gerarToken(usuarioSeguro),
  };
}

export default { cadastrar, login };
