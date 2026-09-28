import { api } from './api.js';

/*
 * Logo da propriedade do produtor logado.
 *
 * `enviarLogo` monta um FormData com o arquivo e chama PUT
 * /usuarios/logo. A camada de API reconhece o FormData e nao serializa
 * como JSON (ver a nota em api.js).
 *
 * Nao ha id em nenhuma chamada: o backend grava sempre no perfil de quem
 * esta no token. E o que impede um produtor de trocar a logo de outro.
 */

export async function enviarLogo(arquivo) {
  const formulario = new FormData();
  formulario.append('logo', arquivo);

  const resposta = await api.put('/usuarios/logo', formulario);
  return resposta.dados;
}

export async function removerLogo() {
  const resposta = await api.delete('/usuarios/logo');
  return resposta.dados;
}
