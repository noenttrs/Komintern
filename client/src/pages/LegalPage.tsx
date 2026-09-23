import { PageShell } from "../components/PageShell";

type LegalPageProps = { editorName: string; contactEmail: string };

export function LegalPage({ editorName, contactEmail }: LegalPageProps): JSX.Element {
  const missing = editorName === "" || contactEmail === "";
  const editor = editorName === "" ? "[nom de l'éditeur à compléter]" : editorName;
  const contact = contactEmail === "" ? "[email de contact à compléter]" : contactEmail;
  const mail = contactEmail === "" ? contact : <a href={`mailto:${contactEmail}`}>{contactEmail}</a>;

  return (
    <PageShell title="Mentions légales">
      <article className="panel page-panel prose">
        {missing ? <p className="form-message form-message--error">Informations de l'éditeur à compléter avant l'ouverture publique.</p> : null}

        <h2>Éditeur et hébergeur</h2>
        <p>
          Site édité à titre personnel et non commercial par <strong>{editor}</strong>, qui en assure aussi l'hébergement sur un serveur
          personnel situé en France. Contact : {mail}.
        </p>
        <p>
          Le trafic transite par <strong>Cloudflare, Inc.</strong> (101 Townsend St, San Francisco, CA 94107, États-Unis — cloudflare.com),
          qui assure le chiffrement HTTPS et la protection du site. Les emails sont envoyés via <strong>Resend</strong> (resend.com).
        </p>

        <h2>Données personnelles</h2>
        <p>Le responsable du traitement est l'éditeur ci-dessus. Aucune donnée n'est vendue ni utilisée à des fins publicitaires.</p>
        <h3>Sans compte</h3>
        <p>
          Seuls ton pseudo et tes actions de jeu sont traités, le temps de la partie. Un identifiant technique aléatoire est stocké dans ton
          navigateur (stockage de session) pour te permettre de retrouver ta place après un rechargement.
        </p>
        <h3>Avec un compte</h3>
        <ul>
          <li><strong>Email</strong> (connexion, codes de validation), <strong>mot de passe</strong> (stocké uniquement sous forme chiffrée argon2), <strong>pseudo</strong>, identifiant Google si tu utilises cette connexion.</li>
          <li><strong>Statistiques</strong> de jeu et <strong>liste d'amis</strong>.</li>
        </ul>
        <p>Base légale : l'exécution du service que tu demandes en créant un compte. Ces données sont conservées jusqu'à la suppression du compte, possible à tout moment depuis la page Profil.</p>
        <h3>Journal des parties et modération</h3>
        <p>
          Chaque partie est journalisée (joueurs, votes, résultats, messages du chat) afin de pouvoir traiter les signalements de
          harcèlement ou de propos haineux et permettre des recours. Base légale : l'intérêt légitime à protéger les joueurs.
          Ce journal n'est accessible qu'au serveur ; il est conservé sans limite de durée mais <strong>anonymisé au bout de 12 mois</strong>
          (pseudos et liens vers les comptes supprimés), sauf dossier de modération en cours.
        </p>
        <p>
          Les messages contenant des termes signalés et les signalements de joueurs ouvrent un dossier de modération
          <strong> pseudonymisé</strong> : la conversation y est examinée sans les noms, et le lien avec les personnes concernées n'est
          consulté qu'en cas de besoin, chaque consultation étant tracée. Une sanction peut aller jusqu'à la suspension du compte.
        </p>
        <h3>Cookies</h3>
        <p>Un seul cookie est utilisé : le cookie de session, strictement nécessaire à la connexion. Il n'y a ni cookie publicitaire ni mesure d'audience, donc pas de bandeau de consentement.</p>
        <h3>Tes droits</h3>
        <p>
          Tu disposes d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité de tes données.
          Écris à {mail}. Tu peux aussi introduire une réclamation auprès de la CNIL (cnil.fr).
        </p>

        <h2>Propriété intellectuelle</h2>
        <p>Le code, les textes et les éléments graphiques du site sont la propriété de l'éditeur, sauf mention contraire.</p>
      </article>
    </PageShell>
  );
}
