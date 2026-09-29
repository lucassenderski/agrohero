import { Link } from 'react-router-dom';
import './Sobre.css';

const DISTRITOS_ATENDIDOS = [
  'Novo Sarandi',
  'Concórdia do Oeste',
  'Dez de Maio',
  'Vila Nova',
];

/*
 * Pagina de apresentacao da iniciativa.
 *
 * Conteudo editorial (vive no frontend, nao vem da API): quem esta lendo
 * e um visitante que chegou pelo "Sobre a iniciativa" do cabecalho, e o
 * texto precisa carregar mesmo com a API fora do ar.
 *
 * A estilizacao reusa a linguagem da Home - hero verde com o selo, os
 * cartoes de superficie com borda e os "eyebrows" em caixa alta - para a
 * pagina nao parecer de outro site.
 */
export default function Sobre() {
  return (
    <div className="container sobre">
      <section className="sobre__hero">
        <p className="sobre__selo">Toledo, Paraná • Oeste Paranaense</p>
        <h1 className="sobre__titulo">
          Agro Hero Toledo: <mark>Conectando</mark> Agricultores e Consumidores
        </h1>
        <p className="sobre__subtitulo">
          Plataforma sustentável voltada para agricultores familiares e de pequeno porte da
          região de Toledo - PR que produzem alimentos orgânicos frescos com práticas
          regenerativas.
        </p>
        <div className="sobre__acoes">
          <Link className="botao botao--destaque" to="/produtos">
            Ver produtos locais <span>→</span>
          </Link>
          <Link className="botao botao--contorno" to="/agricultores">
            Conheça os produtores
          </Link>
        </div>
      </section>

      <section className="sobre__missao">
        <p className="sobre__eyebrow">Nossa história</p>
        <h2 className="sobre__secao-titulo">Nossa Missão em Toledo - PR</h2>
        <p>
          O município de Toledo é reconhecido nacionalmente pela sua força agropecuária. No
          entanto, os pequenos agricultores familiares e produtores agroecológicos muitas
          vezes enfrentavam dificuldades para escoar sua colheita sem depender de
          intermediários predatórios.
        </p>
        <p>
          Esta plataforma democratiza o acesso a alimentos limpos, sem agrotóxicos e colhidos
          sob demanda, garantindo que <strong>100% do valor</strong> chegue à mão das famílias
          camponesas.
        </p>
      </section>

      <section className="sobre__distritos">
        <p className="sobre__eyebrow">Onde estamos</p>
        <h2 className="sobre__secao-titulo">Distritos e Linhas Rurais de Toledo Atendidas</h2>
        <ul className="sobre__lista">
          {DISTRITOS_ATENDIDOS.map((distrito) => (
            <li key={distrito} className="sobre__distrito">
              <span aria-hidden="true">🌾</span> {distrito}
            </li>
          ))}
        </ul>
      </section>

      <section className="sobre__proposito">
        <p className="sobre__eyebrow">Nosso propósito</p>
        <h2 className="sobre__proposito-titulo">Mais renda para o produtor e menos desperdício</h2>
        <p className="sobre__proposito-texto">
          Colheita programada após encomenda, aumentando a renda de quem planta e evitando que
          alimento bom se perca por falta de comprador.
        </p>
      </section>
    </div>
  );
}
