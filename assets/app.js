/* ==========================================================================
   Site public : chargement, filtrage et affichage des projets.
   ========================================================================== */

(function () {
  "use strict";

  const CLES_FILTRES = ["cycle", "ensemble", "programmation", "univers", "difficulte", "duree", "materiel"];
  const etat = {
    cycle: [], ensemble: [], programmation: [], univers: [],
    difficulte: [], duree: [], materiel: [], q: ""
  };
  let parcoursConfiguration = {};
  fetch("data/parcours.json", {cache:"no-store"}).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(d => { parcoursConfiguration = d; }).catch(() => {});
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
  const elLibelleFiltres = document.getElementById("libelle-filtres");
  const boutonsContinuum = Array.from(document.querySelectorAll(".continuum__carte"));
  const elContinuum = document.querySelector(".continuum");
  const elBasculeContinuum = document.getElementById("bascule-continuum");
  const elLibelleContinuum = document.getElementById("libelle-continuum");
  const boutonsReset = [
    document.getElementById("reinitialiser"),
    document.getElementById("reinitialiser-2")
  ];


  /* ---------- Mesure des usages pédagogiques (PostHog) ---------- */
  function mesurer(evenement, proprietes) {
    if (window.posthog && typeof window.posthog.capture === "function") {
      window.posthog.capture(evenement, proprietes);
    }
  }

  // Délégation : fonctionne aussi après le rechargement des tuiles par les filtres.
  elGrille.addEventListener("click", (evenement) => {
    const lien = evenement.target.closest("a[data-document-type]");
    if (!lien || !elGrille.contains(lien)) return;
    mesurer("document_ouvert", {
      type_document: lien.dataset.documentType,
      projet: lien.dataset.projetTitre,
      ensemble: lien.dataset.projetEnsemble,
      cycles: lien.dataset.projetCycle
    });
  });

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
    document.getElementById("filtres-programmation"),
    "programmation",
    PROGRAMMATIONS.map((p) => ({ valeur: p.id, libelle: p.nom }))
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
  construireJetons(
    document.getElementById("filtres-duree"),
    "duree",
    DUREES.map((d) => ({ valeur: String(d.id), libelle: d.texte }))
  );
  construireJetons(
    document.getElementById("filtres-materiel"),
    "materiel",
    MOTEURS.filter((m) => Number(m.id) > 0).map((m) => ({ valeur: `moteur-${m.id}`, libelle: `${m.icone} ${m.court}` }))
      .concat(COMPOSANTS.map((c) => ({ valeur: `composant-${c.id}`, libelle: `${c.icone} ${c.court}` })))
  );

  document.querySelectorAll(".jeton").forEach((bouton) => {
    bouton.addEventListener("click", () => {
      const cle = bouton.dataset.cle;
      const valeur = bouton.dataset.valeur;
      if (!valeur) {
        etat[cle] = [];
      } else {
        const valeurs = new Set(etat[cle]);
        if (valeurs.has(valeur)) valeurs.delete(valeur);
        else valeurs.add(valeur);
        etat[cle] = Array.from(valeurs);
      }
      mesurer("filtre_utilise", { categorie: cle, choix: valeur || "tous", actif: !valeur || etat[cle].includes(valeur) });
      appliquer();
    });
  });

  function reglerContinuumReduit(reduit, memoriser = true) {
    if (!elContinuum || !elBasculeContinuum) return;
    elContinuum.classList.toggle("continuum--reduit", reduit);
    elBasculeContinuum.setAttribute("aria-expanded", String(!reduit));
    if (elLibelleContinuum) elLibelleContinuum.textContent = reduit ? "Afficher" : "Réduire";
    if (memoriser) {
      try { localStorage.setItem("continuum-reduit", reduit ? "1" : "0"); } catch (_) {}
    }
  }

  if (elContinuum && elBasculeContinuum) {
    let continuumReduit = false;
    try { continuumReduit = localStorage.getItem("continuum-reduit") === "1"; } catch (_) {}
    reglerContinuumReduit(continuumReduit, false);

    elBasculeContinuum.addEventListener("click", () => {
      reglerContinuumReduit(!elContinuum.classList.contains("continuum--reduit"));
    });
  }

  const dialogueEnsemble = document.getElementById("parcours-dialogue");
  const choixEnsemble = document.getElementById("parcours-choix");
  const confirmerEnsemble = document.getElementById("parcours-confirmer");
  let cycleChoisi = "1";
  let ensembleChoisi = "";
  function choisirEnsemble(cycle, selection = "") {
    cycleChoisi = cycle;
    ensembleChoisi = selection;
    document.getElementById("parcours-dialogue-cycle").textContent = CYCLES.find(c => c.id === cycle)?.court || "";
    choixEnsemble.replaceChildren();
    const disponibles = ENSEMBLES.filter(e => projets.some(p => listeValeurs(p.cycle).includes(cycle) && p.ensemble === e.id));
    confirmerEnsemble.disabled = !disponibles.some(e => e.id === selection);
    disponibles.forEach(e => {
      const label = document.createElement("label");
      label.className = "reservation-personne";
      const radio = document.createElement("input");
      radio.type = "radio"; radio.name = "parcours-ensemble"; radio.value = e.id; radio.checked = e.id === selection;
      const nom = document.createElement("strong"); nom.textContent = e.nom;
      radio.addEventListener("change", () => { ensembleChoisi = e.id; confirmerEnsemble.disabled = false; });
      label.append(radio, nom); choixEnsemble.append(label);
    });
    dialogueEnsemble.showModal();
  }
  document.getElementById("parcours-dialogue-fermer").onclick = () => dialogueEnsemble.close();
  dialogueEnsemble.addEventListener("click", e => { if (e.target === dialogueEnsemble) { const r = dialogueEnsemble.getBoundingClientRect(); if(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialogueEnsemble.close(); } });
  confirmerEnsemble.onclick = () => {
    if (!ensembleChoisi || confirmerEnsemble.disabled) return;
    dialogueEnsemble.close();
    ouvrirParcours(cycleChoisi, ensembleChoisi);
  };

  function ouvrirParcours(cycle = "1", ensemble = "") {
    const zone = document.getElementById("parcours");
    if (!projets.length) return;
    const choix = ENSEMBLES.filter(e => projets.some(p => listeValeurs(p.cycle).includes(cycle) && p.ensemble === e.id));

    let configuration = parcoursConfiguration;

    const etapes = (configuration[cycle]?.[ensemble] || []).map((e, i) => [e.projet, `Étape ${i + 1}`, e.intention]);
    const nomCycle = CYCLES.find(c => c.id === cycle)?.court || "";
    const modes = [...new Set(etapes.map(([id]) => projets.find(p => p.id === id)?.programmation).filter(Boolean))].map(id => PROGRAMMATIONS.find(p => p.id === id)?.nom || id).join(" / ");
    const nomEnsemble = choix.find(e => e.id === ensemble)?.nom;
    zone.innerHTML = `<div class="parcours-entete"><div><p class="continuum__sur-titre">${nomEnsemble ? nomEnsemble + (modes ? " · " + modes : "") : "Votre matériel, votre parcours"}</p><h3 id="parcours-titre" tabindex="-1">Mon parcours au ${nomCycle}</h3><p>${ensemble ? `${etapes.length} activités pour avancer progressivement. Suivez l’ordre proposé ou choisissez votre prochaine étape.` : "Choisissez d’abord votre ensemble pour découvrir une progression adaptée à votre matériel."}</p></div><button type="button" class="lien-bouton" id="fermer-parcours">Réduire le parcours ↑</button></div><button type="button" class="bouton" id="parcours-changer-ensemble">Changer d’ensemble</button>${ensemble ? `<ol class="parcours-etapes">` : ""}` + etapes.map(([id, titre, intention], i) => {
      const p = projets.find(p => p.id === id);
      if (!p || p.ensemble !== ensemble || !listeValeurs(p.cycle).includes(cycle)) return "";
      return `<li><span class="parcours-numero">${i+1}</span><img src="${p.image}" alt="" loading="lazy"><div><p class="parcours-repere">${titre} · ${p.duree} min</p><h4>${p.titre}</h4><p>${echapper(p.description || "")}</p><div class="parcours-docs">${!p.documents?.eleve && !p.lien && !p.documents?.guide ? `<span>Documents à venir</span>` : ""}${(p.documents?.eleve || p.lien) ? `<a class="bouton" href="${p.documents?.eleve || p.lien}" target="_blank" rel="noopener noreferrer">Cahier de l’élève ↗</a>` : ""}${p.documents?.guide ? `<a class="bouton" href="${p.documents.guide}" target="_blank" rel="noopener noreferrer">Guide de l’enseignant ↗</a>` : ""}</div></div></li>`;
    }).join("") + (ensemble ? `</ol><div class="parcours-bas"><p>Une progression proposée à adapter au rythme de votre classe.</p><button type="button" class="bouton" id="explorer-cycle">Explorer les projets de cet ensemble →</button></div>` : `<p>Les ensembles proposés correspondent aux projets actuellement disponibles pour le ${nomCycle}.</p>`);
    zone.hidden = false;
    boutonsContinuum.forEach(b => b.setAttribute("aria-expanded", String(b.dataset.cycle === cycle)));
    document.getElementById("fermer-parcours").onclick = () => { zone.hidden = true; const b = boutonsContinuum.find(b => b.dataset.cycle === cycle); b.setAttribute("aria-expanded", "false"); b.focus(); };
    document.getElementById("parcours-changer-ensemble").onclick = () => choisirEnsemble(cycle, ensemble);
    const explorer = document.getElementById("explorer-cycle");
    if (explorer) explorer.onclick = () => { etat.cycle = [cycle]; etat.ensemble = [ensemble]; appliquer(); document.getElementById("resultats").scrollIntoView({behavior:"smooth"}); };
    document.getElementById("parcours-titre").focus({preventScroll:true});
    zone.scrollIntoView({behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block:"nearest"});
  }

  boutonsContinuum.forEach((bouton) => {
    bouton.addEventListener("click", () => {
      if (["1", "2", "3"].includes(bouton.dataset.cycle)) { choisirEnsemble(bouton.dataset.cycle); return; }
      document.getElementById("parcours").hidden = true;
      etat.cycle = [bouton.dataset.cycle];
      mesurer("continuum_selectionne", { cycle: bouton.dataset.cycle });
      appliquer();
      document.getElementById("resultats").scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start"
      });
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
    CLES_FILTRES.forEach((cle) => { etat[cle] = []; });
    etat.q = "";
    elRecherche.value = "";
    appliquer();
    elRecherche.focus();
  }));

  /* ---------- Adresse partageable ----------
     Les filtres se reflètent dans l'adresse : un conseiller peut ainsi
     transmettre « les projets de 2e cycle en Spike Prime » par courriel. */

  function lireAdresse() {
    const p = new URLSearchParams(window.location.search);
    const lireChoix = (cle, optionsValides) => {
      const valeurs = p.getAll(cle)
        .flatMap((valeur) => valeur.split(","))
        .map((valeur) => valeur.trim())
        .filter((valeur) => optionsValides.includes(valeur));
      return Array.from(new Set(valeurs));
    };

    etat.cycle = lireChoix("cycle", CYCLES.map((c) => c.id));
    etat.ensemble = lireChoix("ensemble", ENSEMBLES.map((e) => e.id));
    etat.programmation = lireChoix("programmation", PROGRAMMATIONS.map((option) => option.id));
    etat.univers = lireChoix("univers", UNIVERS.map((u) => u.id));
    etat.difficulte = lireChoix("difficulte", DIFFICULTES.map((d) => d.id));
    etat.duree = lireChoix("duree", DUREES.map((d) => String(d.id)));
    const optionsMateriel = MOTEURS.filter((m) => Number(m.id) > 0).map((m) => `moteur-${m.id}`)
      .concat(COMPOSANTS.map((c) => `composant-${c.id}`));
    etat.materiel = lireChoix("materiel", optionsMateriel);
    etat.q = p.get("q") || "";
    elRecherche.value = etat.q;
  }

  function ecrireAdresse() {
    const p = new URLSearchParams();
    CLES_FILTRES.forEach((cle) => {
      etat[cle].forEach((valeur) => p.append(cle, valeur));
    });
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
    const programmation = programmationParId(p.programmation || programmationParDefaut(p.ensemble));
    const cycles = listeValeurs(p.cycle).map(cycleParId).filter(Boolean);
    const univers = listeValeurs(p.univers).map(universParId).filter(Boolean);
    const niveau = difficulteParId(p.difficulte);
    const duree = dureeParId(p.duree);
    const materiel = libellesMateriel(p);
    const botte = normaliser(
      `${p.titre} ${p.description} ${cycles.map((c) => c.long).join(" ")} ${ensemble ? ensemble.nom : ""} ` +
      `${programmation ? programmation.nom : ""} ${univers.map((u) => u.long).join(" ")} ` +
      `${niveau ? niveau.nom : ""} ${duree ? `${duree.texte} ${duree.detail}` : ""} ${materiel.join(" ")}`);
    return mots.every((mot) => botte.includes(mot));
  }

  function correspondFiltres(p, cleIgnoree = "") {
    for (const cle of CLES_FILTRES) {
      if (cle === cleIgnoree || etat[cle].length === 0) continue;
      const valeurs = valeursProjet(p, cle);
      if (!etat[cle].some((valeur) => valeurs.includes(valeur))) return false;
    }
    return correspondRecherche(p);
  }

  function filtrer() {
    return projets.filter((p) => correspondFiltres(p));
  }

  function valeursProjet(p, cle) {
    if (cle === "materiel") return valeursMateriel(p);
    if (cle === "programmation") return [p.programmation || programmationParDefaut(p.ensemble)];
    if (cle === "duree") return [String(p.duree || "")].filter(Boolean);
    return listeValeurs(p[cle]);
  }

  function mettreAJourFiltres() {
    document.querySelectorAll(".jeton").forEach((bouton) => {
      const cle = bouton.dataset.cle;
      const valeur = bouton.dataset.valeur;
      const actif = valeur ? etat[cle].includes(valeur) : etat[cle].length === 0;
      const nombre = projets.filter((p) =>
        correspondFiltres(p, cle) && (!valeur || valeursProjet(p, cle).includes(valeur))
      ).length;

      bouton.setAttribute("aria-pressed", String(actif));
      bouton.disabled = nombre === 0 && !actif;
      bouton.querySelector(".jeton__compte").textContent = `(${nombre})`;
      bouton.setAttribute(
        "aria-label",
        `${bouton.dataset.libelle}, ${nombre} projet${nombre > 1 ? "s" : ""}${actif ? ", sélectionné" : ""}`
      );
    });

    const nombreActifs = CLES_FILTRES.reduce((total, cle) => total + etat[cle].length, 0) + (etat.q ? 1 : 0);
    if (elNombreFiltres) {
      elNombreFiltres.hidden = nombreActifs === 0;
      elNombreFiltres.textContent = nombreActifs;
    }
  }

  function mettreAJourContinuum() {
    boutonsContinuum.forEach((bouton) => {
      const cycle = bouton.dataset.cycle;
      const nombre = projets.filter((p) => listeValeurs(p.cycle).includes(cycle)).length;
      const actif = etat.cycle.includes(cycle);
      const action = bouton.querySelector("[data-compte-cycle]");

      bouton.setAttribute("aria-pressed", String(actif));
      bouton.disabled = nombre === 0;
      if (action) {
        action.innerHTML = `${["1", "2", "3"].includes(cycle) ? "Découvrir le parcours · " : ""}${nombre} projet${nombre > 1 ? "s" : ""} <span aria-hidden="true">→</span>`;
      }
    });
  }

  function appliquer() {
    const visibles = filtrer();
    const filtreActif = CLES_FILTRES.some((cle) => etat[cle].length > 0) || Boolean(etat.q);

    mettreAJourFiltres();
    mettreAJourContinuum();

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
