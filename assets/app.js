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
      .map((c) => `<button type="button" class="jeton" data-cle="${cle}" data-valeur="${echapper(c.valeur)}" aria-pressed="false">${echapper(c.libelle)}</button>`)
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

  function filtrer() {
    const recherche = normaliser(etat.q);
    const mots = recherche ? recherche.split(/\s+/).filter(Boolean) : [];

    return projets.filter((p) => {
      if (etat.cycle && String(p.cycle) !== etat.cycle) return false;
      if (etat.ensemble && p.ensemble !== etat.ensemble) return false;
      if (etat.univers && p.univers !== etat.univers) return false;
      if (etat.difficulte && p.difficulte !== etat.difficulte) return false;
      if (!mots.length) return true;

      const ensemble = ensembleParId(p.ensemble);
      const univers = universParId(p.univers);
      const niveau = difficulteParId(p.difficulte);
      const botte = normaliser(
        `${p.titre} ${p.description} ${ensemble ? ensemble.nom : ""} ${univers ? univers.long : ""} ${niveau ? niveau.nom : ""}`);
      return mots.every((mot) => botte.includes(mot));
    });
  }

  function appliquer() {
    const visibles = filtrer();
    const filtreActif = Boolean(etat.cycle || etat.ensemble || etat.univers || etat.difficulte || etat.q);

    document.querySelectorAll(".jeton").forEach((b) => {
      b.setAttribute("aria-pressed", String(etat[b.dataset.cle] === b.dataset.valeur));
    });

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
