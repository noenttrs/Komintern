import { PageShell } from "../components/PageShell";

export function SupportPage({ donationUrl }: { donationUrl: string }): JSX.Element {
  return (
    <PageShell title="Soutenir le projet">
      <article className="panel page-panel prose">
        <p>
          <strong>Nazi Communiste</strong> est gratuit, sans publicité et sans revente de données. Il est développé et hébergé
          bénévolement.
        </p>
        <p>Un don, même petit, aide à :</p>
        <ul>
          <li>payer le domaine, l'envoi des emails et l'hébergement ;</li>
          <li>ajouter de nouveaux modes (7 à 11 joueurs), des variantes de règles et des statistiques plus poussées ;</li>
          <li>améliorer l'accessibilité et la modération pour que les parties restent agréables.</li>
        </ul>
        {donationUrl !== "" ? (
          <a className="button-link button-link--primary" href={donationUrl} target="_blank" rel="noopener noreferrer">
            Faire un don sur Ko-fi ↗
          </a>
        ) : (
          <p className="form-message">Les dons ouvrent bientôt.</p>
        )}
        <p className="mono">Le paiement a lieu sur Ko-fi : aucune donnée bancaire ne passe par ce site.</p>
        <p>Tu peux aussi aider en parlant du jeu autour de toi, ou en signalant un bug via la page Contact.</p>
      </article>
    </PageShell>
  );
}
