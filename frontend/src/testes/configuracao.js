import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

/*
 * Tempo de espera padrao das consultas assincronas (`findBy*`, `waitFor`).
 *
 * O padrao do Testing Library e 1s, curto demais para estes testes: eles
 * falam com um backend de verdade, e varias telas so montam o conteudo
 * depois de DUAS chamadas de API (o painel do produtor busca produtos e
 * itens de pedido em paralelo, por exemplo).
 *
 * A suite roda os arquivos em paralelo contra um unico servidor, e o
 * cadastro de usuario passa por bcrypt com 12 rounds - que bloqueia o
 * event loop. Sob essa concorrencia, uma resposta que leva 200ms sozinha
 * as vezes passa de 1s, e o teste falha por tempo, nao por defeito. Era a
 * causa de falhas intermitentes em `painelAgricultor` e
 * `painelConsumidor`, que somem quando o arquivo roda sozinho.
 *
 * Elevar o teto nao esconde defeito: uma assercao errada continua
 * falhando, so demora mais para desistir. Os fluxos mais pesados (compra
 * completa, pedido entregue) seguem com timeout proprio, maior que este.
 */
configure({ asyncUtilTimeout: 6000 });

/*
 * `cleanup` desmonta a arvore React depois de cada teste: sem isso o
 * DOM acumula componentes entre testes e uma consulta por texto passa
 * a encontrar elementos da execucao anterior.
 */
afterEach(() => {
  cleanup();
});