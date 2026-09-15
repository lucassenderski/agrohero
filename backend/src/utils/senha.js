import bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';
import env from '../config/env.js';

/*
 * Utilitarios de senha.
 *
 * REGRA ABSOLUTA: a senha em texto puro existe apenas em memoria, durante
 * o cadastro e o login. Ela nunca e gravada, nunca e logada e nunca entra
 * no token JWT.
 *
 * bcrypt e um algoritmo deliberadamente lento (custo 12 = 2^12 iteracoes).
 * Isso torna a forca bruta cara mesmo se o banco vazar. Um hash rapido
 * como SHA-256 seria um erro grave aqui: seria possivel testar bilhoes de
 * senhas por segundo.
 */

/* Gera o hash de uma senha em texto puro. */
export async function gerarHashSenha(senhaTextoPuro) {
  return bcrypt.hash(senhaTextoPuro, env.BCRYPT_SALT_ROUNDS);
}

/* Compara senha em texto puro com o hash guardado. */
export async function conferirSenha(senhaTextoPuro, hashGuardado) {
  return bcrypt.compare(senhaTextoPuro, hashGuardado);
}

/*
 * Gera uma senha aleatoria forte.
 *
 * Usada para a senha inicial do administrador, para que nenhum ambiente
 * nasca com uma senha conhecida e versionada.
 */
export function gerarSenhaAleatoria(tamanho = 20) {
  const alfabeto =
    'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
  // randomInt do node:crypto e criptograficamente seguro, diferente de
  // Math.random, que nao serve para gerar credencial.
  let senha = '';
  for (let i = 0; i < tamanho; i += 1) {
    senha += alfabeto[randomInt(0, alfabeto.length)];
  }
  return senha;
}

export default { gerarHashSenha, conferirSenha, gerarSenhaAleatoria };