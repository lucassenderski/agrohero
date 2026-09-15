/*
 * Preparacao executada pelo Jest ANTES de carregar qualquer teste.
 *
 * Definimos NODE_ENV=test aqui porque config/env.js valida o ambiente na
 * importacao. Com NODE_ENV=test:
 *   - a aplicacao usa DATABASE_URL_TEST (banco descartavel);
 *   - o rate limit e desligado, evitando falso negativo nos testes;
 *   - o log de requisicoes e silenciado.
 *
 * O dotenv nao sobrescreve variaveis ja definidas, entao este valor
 * permanece mesmo carregando o arquivo backend/.env depois.
 */
process.env.NODE_ENV = 'test';

/*
 * O prazo dos testes (testTimeout) e o prazo do afterAll sao definidos na
 * configuracao do Jest, em package.json. Nao usamos jest.setTimeout() aqui
 * porque este arquivo e um modulo ES e o global `jest` nao existe neste
 * escopo - a chamada falharia com "jest is not defined".
 */