import { PageShell } from "../components/PageShell";

export function AboutPage(): JSX.Element {
  return (
    <PageShell title="À propos">
      <article className="panel page-panel prose">
        <p>
          <strong>Nazi Communiste</strong> est un jeu de déduction sociale en ligne, pensé pour être joué autour d'une table, chacun sur
          son téléphone — ou à distance grâce au chat intégré. Deux camps secrets s'affrontent sur une série de missions.
        </p>
        <h2>Les camps</h2>
        <ul>
          <li><strong>Les nazis</strong> (minorité) connaissent le rôle de tout le monde et cherchent à saboter les missions.</li>
          <li><strong>Les communistes</strong> (majorité) ne connaissent que leur propre rôle et doivent démasquer les saboteurs.</li>
        </ul>
        <h2>Une manche</h2>
        <ol>
          <li><strong>Proposition</strong> — le chef choisit une équipe de la taille demandée.</li>
          <li><strong>Vote de confiance</strong> — tout le monde vote publiquement. Il faut une majorité stricte de « pour » : en cas d'égalité ou de refus, le même chef propose une autre équipe.</li>
          <li><strong>Mission</strong> — chaque membre de l'équipe vote en secret. Un seul vote nazi suffit à faire échouer la mission ; les communistes ne peuvent voter que communiste.</li>
        </ol>
        <p>Le premier camp à remporter 3 missions gagne. Le rôle de chef tourne à chaque nouvelle manche.</p>
        <h2>À 5 joueurs</h2>
        <p>2 nazis, 3 communistes, 5 missions avec des équipes de 2, 3, 2, 3 et 3 joueurs. D'autres formats (3, 4 et 6 joueurs) sont disponibles.</p>
        <h2>Compte facultatif</h2>
        <p>
          On joue sans inscription. Un compte permet de garder ses statistiques (victoires, défaites, parties jouées dans chaque camp),
          d'ajouter des amis, de voir s'ils sont en ligne et de les inviter dans sa room.
        </p>
        <p className="mono">
          Pour les agents IA : <a href="/llms.txt">/llms.txt</a> · <a href="/agents.html">/agents.html</a>
        </p>
      </article>
    </PageShell>
  );
}
