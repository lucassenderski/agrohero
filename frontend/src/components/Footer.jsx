import './Footer.css';

/*
 * Rodape da aplicacao.
 */
export default function Footer() {
  const ano = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container footer__interno">
        <p className="footer__texto">
          {ano} AgroHero - marketplace de produtos organicos direto do produtor.
        </p>
        <p className="footer__texto footer__texto--suave">
          Projeto em desenvolvimento. Fase 1 de 24 concluida.
        </p>
      </div>
    </footer>
  );
}