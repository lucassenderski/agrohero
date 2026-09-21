import { randomBytes, createHash } from 'node:crypto';
import redefinicaoRepository from '../repositories/redefinicaoSenhaRepository.js';
import usuarioRepository from '../repositories/usuarioRepository.js';
import { gerarHashSenha } from '../utils/senha.js';
import { erros } from '../utils/AppError.js';
import { enviarEmailRedefinicao } from './emailService.js';

const HORAS_TOKEN = 1;
const RESPOSTA = 'Se o e-mail estiver cadastrado, voce recebera instrucoes para redefinir a senha.';

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export async function solicitar({ email }) {
  const usuario = await redefinicaoRepository.buscarUsuarioPorEmail(email);

  // A resposta e sempre igual, inclusive para contas inativas e inexistentes.
  if (!usuario || !usuario.ativo) return { mensagem: RESPOSTA };

  const token = randomBytes(32).toString('hex');
  const expiraEm = new Date(Date.now() + HORAS_TOKEN * 60 * 60 * 1000);

  await redefinicaoRepository.emTransacao(async (cliente) => {
    await redefinicaoRepository.invalidarAtivos(usuario.id, cliente);
    await redefinicaoRepository.criar(
      { usuarioId: usuario.id, tokenHash: hashToken(token), expiraEm },
      cliente,
    );
  });

  await enviarEmailRedefinicao({ email: usuario.email, token });
  return { mensagem: RESPOSTA };
}

export async function redefinir({ token, senha }) {
  const senhaHash = await gerarHashSenha(senha);
  const tokenHash = hashToken(token);

  const atualizado = await redefinicaoRepository.emTransacao(async (cliente) => {
    const registro = await redefinicaoRepository.buscarValido(tokenHash, cliente);
    if (!registro) throw erros.regraNegocio('Token invalido ou expirado.', 'TOKEN_REDEFINICAO_INVALIDO');

    const marcado = await redefinicaoRepository.marcarUsado(registro.id, cliente);
    if (!marcado) throw erros.regraNegocio('Token invalido ou expirado.', 'TOKEN_REDEFINICAO_INVALIDO');

    const usuario = await usuarioRepository.atualizarSenha(
      registro.usuario_id,
      senhaHash,
      cliente,
    );
    await redefinicaoRepository.invalidarAtivos(registro.usuario_id, cliente);
    return usuario;
  });

  if (!atualizado) throw erros.regraNegocio('Token invalido ou expirado.', 'TOKEN_REDEFINICAO_INVALIDO');
  return { mensagem: 'Senha redefinida com sucesso.' };
}

export default { solicitar, redefinir };
