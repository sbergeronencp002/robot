/* ==========================================================================
   Site public : chargement, filtrage et affichage des projets.
   ========================================================================== */

(function () {
  "use strict";

  const etat = { cycle: "", ensemble: "", univers: "", difficulte: "", q: "" };
  let projets = [];

  const elGrille   = document.getElementById("grille");
  const elCompte   = document.getElementById("compte");
  const elVide     = document.getElementById("etat-vide");
  const elVideTtr  = document.getElementById("etat-vide-titre");
  const elVideTxt  = document.getElementById("etat-vide-texte");
  const elRecherche = document.getElementById("recherche");
  const elZoneFiltres = document.getElementById("zone-filtres");
  const elBasculeFiltres = document.getElementById("bascule-filtres");
  const elNombreFiltres = document.getElementById("nombre-filtres");
  const boutonsReset = [
    document.getElementById("reinitialiser"),
    document.getElementById("reinitialiser-2")
  ];

  /* ---------- Construction des filtres ---------- */

  function construireJetons(conteneur, cle, options) {
    // Une page servie depuis le cache peut ne pas contenir une rangée de
    // filtres ajoutée depuis. On l'ignore plutôt que d'interrompre le script,
    // ce qui laisserait la grille vide et les filtres inertes.
    if (!conteneur) return;
    const choix = [{ valeur: "", libelle: "Tous" }].concat(options);
    conteneur.innerHTML = choix
      .map((c) => `<button type="button" class="jeton" data-cle="${cle}" data-valeur="${echapper(c.valeur)}" data-libelle="${echapper(c.libelle)}" aria-pressed="false"><span>${echapper(c.libelle)}</span><span class="jeton__compte" aria-hidden="true"></span></button>`)
      .join("");
  }

  construireJetons(
    document.getElementById("filtres-cycle"),
    "cycle",
    CYCLES.map((c) => ({ valeur: c.id, libelle: c.court }))
  );
  construireJetons(
    document.getElementById("filtres-ensemble"),
    "ensemble",
    ENSEMBLES.map((e) => ({ valeur: e.id, libelle: e.nom }))
  );
  construireJetons(
    document.getElementById("filtres-univers"),
    "univers",
    UNIVERS.map((u) => ({ valeur: u.id, libelle: `${u.icone} ${u.long}` }))
  );
  construireJetons(
    document.getElementById("filtres-difficulte"),
    "difficulte",
    DIFFICULTES.map((d) => ({ valeur: d.id, libelle: `${pastilles(d)} ${d.nom}` }))
  );

  document.querySelectorAll(".jeton").forEach((bouton) => {
    bouton.addEventListener("click", () => {
      const cle = bouton.dataset.cle;
      // Recliquer sur un filtre actif le désactive.
      etat[cle] = etat[cle] === bouton.dataset.valeur ? "" : bouton.dataset.valeur;
      appliquer();
    });
  });

  if (elBasculeFiltres) {
    elBasculeFiltres.addEventListener("click", () => {
      const ouvert = elZoneFiltres.classList.toggle("filtres--ouvert");
      elBasculeFiltres.setAttribute("aria-expanded", String(ouvert));
    });
  }

  let minuterie;
  elRecherche.addEventListener("input", () => {
    clearTimeout(minuterie);
    minuterie = setTimeout(() => { etat.q = elRecherche.value.trim(); appliquer(); }, 160);
  });

  boutonsReset.forEach((b) => b && b.addEventListener("click", () => {
    etat.cycle = ""; etat.ensemble = ""; etat.univers = ""; etat.difficulte = ""; etat.q = "";
    elRecherche.value = "";
    appliquer();
    elRecherche.focus();
  }));

  /* ---------- Adresse partageable ----------
     Les filtres se reflètent dans l'adresse : un conseiller peut ainsi
     transmettre « les projets de 2e cycle en Spike Prime » par courriel. */

  function lireAdresse() {
    const p = new URLSearchParams(window.location.search);
    const cycle = p.get("cycle") || "";
    const ensemble = p.get("ensemble") || "";
    const univers = p.get("univers") || "";
    const difficulte = p.get("difficulte") || "";
    etat.cycle = CYCLES.some((c) => c.id === cycle) ? cycle : "";
    etat.ensemble = ENSEMBLES.some((e) => e.id === ensemble) ? ensemble : "";
    etat.univers = UNIVERS.some((u) => u.id === univers) ? univers : "";
    etat.difficulte = DIFFICULTES.some((d) => d.id === difficulte) ? difficulte : "";
    etat.q = p.get("q") || "";
    elRecherche.value = etat.q;
  }

  function ecrireAdresse() {
    const p = new URLSearchParams();
    if (etat.cycle) p.set("cycle", etat.cycle);
    if (etat.ensemble) p.set("ensemble", etat.ensemble);
    if (etat.univers) p.set("univers", etat.univers);
    if (etat.difficulte) p.set("difficulte", etat.difficulte);
    if (etat.q) p.set("q", etat.q);
    const suite = p.toString();
    history.replaceState(null, "", suite ? `?${suite}` : window.location.pathname);
  }

  /* ---------- Filtrage ---------- */

  function correspondRecherche(p) {
    const recherche = normaliser(etat.q);
    const mots = recherche ? recherche.split(/\s+/).filter(Boolean) : [];
    if (!mots.length) return true;

    const ensemble = ensembleParId(p.ensemble);
    const univers = universParId(p.univers);
    const niveau = difficulteParId(p.difficulte);
    const botte = normaliser(
      `${p.titre} ${p.description} ${ensemble ? ensemble.nom : ""} ${univers ? univers.long : ""} ${niveau ? niveau.nom : ""}`);
    return mots.every((mot) => botte.includes(mot));
  }

  function correspondFiltres(p, cleIgnoree = "") {
    if (cleIgnoree !== "cycle" && etat.cycle && !listeValeurs(p.cycle).includes(etat.cycle)) return false;
    if (cleIgnoree !== "ensemble" && etat.ensemble && p.ensemble !== etat.ensemble) return false;
    if (cleIgnoree !== "univers" && etat.univers && !listeValeurs(p.univers).includes(etat.univers)) return false;
    if (cleIgnoree !== "difficulte" && etat.difficulte && p.difficulte !== etat.difficulte) return false;
    return correspondRecherche(p);
  }

  function filtrer() {
    return projets.filter((p) => correspondFiltres(p));
  }

  function valeursProjet(p, cle) {
    return listeValeurs(p[cle]);
  }

  function mettreAJourFiltres() {
    document.querySelectorAll(".jeton").forEach((bouton) => {
      const cle = bouton.dataset.cle;
      const valeur = bouton.dataset.valeur;
      const actif = etat[cle] === valeur;
      const nombre = projets.filter((p) =>
        correspondFiltres(p, cle) && (!valeur || valeursProjet(p, cle).includes(valeur))
      ).length;

      bouton.setAttribute("aria-pressed", String(actif));
      bouton.disabled = nombre === 0 && !actif;
      bouton.querySelector(".jeton__compte").textContent = `(${nombre})`;
      bouton.setAttribute(
        "aria-label",
        `${bouton.dataset.libelle}, ${nombre} projet${nombre > 1 ? "s" : ""}`
      );
    });

    const nombreActifs = ["cycle", "ensemble", "univers", "difficulte"]
      .filter((cle) => etat[cle]).length + (etat.q ? 1 : 0);
    if (elNombreFiltres) {
      elNombreFiltres.hidden = nombreActifs === 0;
      elNombreFiltres.textContent = nombreActifs;
    }
  }

  function appliquer() {
    const visibles = filtrer();
    const filtreActif = Boolean(etat.cycle || etat.ensemble || etat.univers || etat.difficulte || etat.q);

    mettreAJourFiltres();

    elGrille.innerHTML = visibles
      .map((p) => `<li>${htmlTuile(p)}</li>`)
      .join("");

    const n = visibles.length;
    elCompte.textContent = n === 0
      ? "Aucun projet"
      : `${n} projet${n > 1 ? "s" : ""} affiché${n > 1 ? "s" : ""}${filtreActif ? ` sur ${projets.length}` : ""}`;

    boutonsReset[0].hidden = !filtreActif;
    elVide.hidden = n > 0;

    if (n === 0) {
      const repertoireVide = projets.length === 0;
      elVide.querySelector(".etat-vide__icone").textContent = repertoireVide ? "🤖" : "🔍";
      elVideTtr.textContent = repertoireVide
        ? "Le répertoire est vide pour l’instant"
        : "Aucun projet ne correspond";
      elVideTxt.textContent = repertoireVide
        ? "Les premiers projets apparaîtront ici dès qu’ils auront été ajoutés depuis la page d’administration."
        : "Essayez d’élargir votre recherche ou de retirer un filtre.";
      boutonsReset[1].hidden = repertoireVide;
    }

    ecrireAdresse();
  }

  /* ---------- Chargement des données ---------- */

  function trierRecentsDabord(liste) {
    return liste.slice().sort((a, b) => String(b.cree || "").localeCompare(String(a.cree || "")));
  }

  fetch(`data/projets.json?v=${Date.now()}`, { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((donnees) => {
      projets = trierRecentsDabord(Array.isArray(donnees) ? donnees : (donnees.projets || []));
      lireAdresse();
      appliquer();
    })
    .catch((err) => {
      console.error("Chargement des projets impossible :", err);
      elCompte.textContent = "";
      elVide.hidden = false;
      elVide.querySelector(".etat-vide__icone").textContent = "⚠️";
      elVideTtr.textContent = "Les projets n’ont pas pu être chargés";
      elVideTxt.textContent = "Rafraîchissez la page dans quelques instants. Si le problème persiste, signalez-le à la personne responsable du répertoire.";
      boutonsReset[1].hidden = true;
    });
})();
