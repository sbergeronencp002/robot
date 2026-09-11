/* ==========================================================================
   Constantes et rendu partagés entre le site public et l'administration.
   ========================================================================== */

const CYCLES = [
  { id: "1", court: "1er cycle", long: "1er cycle (1re–2e année)" },
  { id: "2", court: "2e cycle",  long: "2e cycle (3e–4e année)" },
  { id: "3", court: "3e cycle",  long: "3e cycle (5e–6e année)" }
];

const ENSEMBLES = [
  { id: "ev3",       nom: "EV3" },
  { id: "prime",     nom: "Spike Prime" },
  { id: "essentiel", nom: "Spike Essentiel" },
  { id: "wedo",      nom: "WeDo 2.0" }
];

// Les trois univers du programme de science et technologie (PFEQ).
const UNIVERS = [
  { id: "materiel", court: "Matériel",        long: "Univers matériel",  icone: "⚙️" },
  { id: "vivant",   court: "Vivant",          long: "Univers vivant",    icone: "🌱" },
  { id: "terre",    court: "Terre et Espace", long: "Terre et Espace",   icone: "🌍" }
];

// Trois niveaux, rendus par des pastilles pleines pour un repérage rapide.
const DIFFICULTES = [
  { id: "debutant",      nom: "Découverte",    points: 1 },
  { id: "intermediaire", nom: "Intermédiaire", points: 2 },
  { id: "expert",        nom: "Avancé",        points: 3 }
];

const DUREES = [
  { id: 60,  texte: "60 min",  detail: "60 minutes (1 période)" },
  { id: 120, texte: "120 min", detail: "120 minutes (2 périodes)" },
  { id: 180, texte: "180 min", detail: "180 minutes (3 périodes)" }
];

const cycleParId    = (id) => CYCLES.find((c) => c.id === String(id));
const ensembleParId = (id) => ENSEMBLES.find((e) => e.id === id);
const universParId  = (id) => UNIVERS.find((u) => u.id === id);
const difficulteParId = (id) => DIFFICULTES.find((d) => d.id === id);

/* Rend un niveau sous forme de pastilles : ●○○, ●●○, ●●●. */
function pastilles(niveau) {
  return "●".repeat(niveau.points) + "○".repeat(3 - niveau.points);
}
const dureeParId    = (id) => DUREES.find((d) => d.id === Number(id));

/* Échappe le texte destiné à être inséré dans du HTML. */
function echapper(valeur) {
  return String(valeur ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Retire les accents et met en minuscules, pour une recherche tolérante. */
function normaliser(texte) {
  return String(texte ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/* N'accepte que les liens http(s) : évite qu'une donnée malformée
   ne se transforme en lien javascript: sur le site public. */
function lienSur(url) {
  const brut = String(url ?? "").trim();
  if (!brut) return "";
  try {
    const analyse = new URL(brut, window.location.href);
    return (analyse.protocol === "http:" || analyse.protocol === "https:") ? analyse.href : "";
  } catch {
    return "";
  }
}

const ICONE_HORLOGE =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

const ICONE_DOC =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>' +
  '<path d="M14 3v5h5"/></svg>';

/**
 * Construit le HTML d'une tuile de projet.
 * La tuile EST la fiche : elle porte toutes les informations et le lien
 * vers le document SharePoint.
 */
function htmlTuile(projet, options = {}) {
  const { interactif = true } = options;

  const cycle    = cycleParId(projet.cycle);
  const ensemble = ensembleParId(projet.ensemble);
  const univers  = universParId(projet.univers);
  const duree    = dureeParId(projet.duree);
  const niveau   = difficulteParId(projet.difficulte);
  const lien     = interactif ? lienSur(projet.lien) : "";

  const visuel = projet.image
    ? `<div class="tuile__visuel"><img src="${echapper(projet.image)}" alt="" loading="lazy" decoding="async"></div>`
    : `<div class="tuile__visuel tuile__visuel--vide" aria-hidden="true">🤖</div>`;

  const etiquettes = [
    cycle    ? `<span class="etiquette etiquette--cycle">${echapper(cycle.court)}</span>` : "",
    ensemble ? `<span class="etiquette etiquette--ensemble etiquette--${ensemble.id}">${echapper(ensemble.nom)}</span>` : "",
    univers  ? `<span class="etiquette etiquette--univers etiquette--u-${univers.id}"><span aria-hidden="true">${univers.icone}</span> ${echapper(univers.court)}</span>` : ""
  ].join("");

  const action = lien
    ? `<span class="tuile__action">${ICONE_DOC} Ouvrir le document</span>`
    : `<span class="tuile__action tuile__action--absent">Document à venir</span>`;

  const interieur = `
    ${visuel}
    <div class="tuile__corps">
      <div class="tuile__etiquettes">${etiquettes}</div>
      <h3 class="tuile__titre">${echapper(projet.titre)}</h3>
      <p class="tuile__description">${echapper(projet.description)}</p>
      <div class="tuile__pied">
        <span class="tuile__meta">
          <span class="tuile__duree">${ICONE_HORLOGE} ${echapper(duree ? duree.texte : "—")}</span>
          ${niveau ? `<span class="tuile__niveau"><span class="pastilles" aria-hidden="true">${pastilles(niveau)}</span> ${echapper(niveau.nom)}</span>` : ""}
        </span>
        ${action}
      </div>
    </div>`;

  if (lien) {
    return `<a class="tuile" href="${echapper(lien)}" target="_blank" rel="noopener noreferrer">${interieur}</a>`;
  }
  return `<div class="tuile">${interieur}</div>`;
}
