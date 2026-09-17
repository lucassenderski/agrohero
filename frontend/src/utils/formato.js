/*
 * Formatacao de valores para exibicao.
 *
 * Centralizado porque o mesmo numero aparece em varios lugares (card,
 * carrinho, checkout, pedido) e cada um formatando por conta propria
 * acaba gerando "R$ 12.5" em uma tela e "R$ 12,50" em outra.
 */

const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const DATA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/*
 * O backend devolve NUMERIC ja convertido para Number (ver pool.js).
 * Mesmo assim tratamos string, porque o valor pode chegar de um
 * `localStorage` antigo ou de um campo que o driver nao converteu.
 */
export function formatarMoeda(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return MOEDA.format(0);
  return MOEDA.format(numero);
}

export function formatarData(iso) {
  if (!iso) return '';
  return DATA.format(new Date(iso));
}

export function formatarDataHora(iso) {
  if (!iso) return '';
  return DATA_HORA.format(new Date(iso));
}

/* "1,5 kg" - quantidade com a unidade de venda do produto. */
export function formatarQuantidade(quantidade, unidade) {
  const numero = Number(quantidade);
  const texto = Number.isFinite(numero) ? String(numero).replace('.', ',') : '0';
  return unidade ? `${texto} ${unidade}` : texto;
}

export const ROTULOS_STATUS_PEDIDO = {
  PENDENTE: 'Pendente',
  PROCESSANDO: 'Processando',
  ENVIADO: 'Enviado',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
};

export const ROTULOS_STATUS_PAGAMENTO = {
  PENDENTE: 'Aguardando pagamento',
  APROVADO: 'Pagamento aprovado',
  RECUSADO: 'Pagamento recusado',
  CANCELADO: 'Pagamento cancelado',
  REEMBOLSADO: 'Reembolsado',
};

export function rotularStatusPedido(status) {
  return ROTULOS_STATUS_PEDIDO[status] || status;
}

export function rotularStatusPagamento(status) {
  return ROTULOS_STATUS_PAGAMENTO[status] || status;
}

/*
 * Classe CSS do selo de status. O CSS nao pode receber o status cru
 * como seletor sem risco de colisao, entao mapeamos para um conjunto
 * fechado de variantes visuais.
 */
export function classeStatusPedido(status) {
  return `selo selo--${(status || '').toLowerCase()}`;
}

/* Iniciais para o avatar quando nao ha foto. */
export function iniciais(nome) {
  if (!nome) return '?';
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() || '')
    .join('');
}

/* Endereco em uma linha, para resumo de pedido e lista. */
export function resumirEndereco(endereco) {
  if (!endereco) return '';
  const partes = [
    `${endereco.rua}, ${endereco.numero}`,
    endereco.complemento,
    endereco.bairro,
    `${endereco.cidade}/${endereco.estado}`,
  ].filter(Boolean);
  return partes.join(' - ');
}
