/* ==========================================================================
   Administration : édition des projets et publication vers GitHub.

   Fonctionnement : on travaille sur une copie locale du répertoire
   (conservée dans ce navigateur), puis « Publier » envoie d'un coup les
   images en attente et le fichier de données vers le dépôt. GitHub Pages
   régénère le site public en une minute ou deux.
   ========================================================================== */

(function () {
  "use strict";

  const CLE_DEPOT    = "robotique.depot";
  const CLE_BROUILLON = "robotique.brouillon";
  const CHEMIN_JSON  = "data/projets.json";
  const LARGEUR_MAX  = 1000;   // px — suffisant pour une tuile, léger pour le dépôt
  const QUALITE_JPEG = 0.82;
  const RATIO_TUILE  = 16 / 10; // toutes les vignettes sont recadrées à ce format

  /* ---------- État ---------- */

  const depot = { owner: "", repo: "", branche: "main", jeton: "" };

  let projets = [];            // copie de travail
  let shaJson = null;          // empreinte du fichier tel qu'il est sur GitHub
  let imagesEnAttente = {};    // chemin -> dataURL, pas encore téléversées
  let modifie = false;         // des changements non publiés ?
  let connecte = false;
  let idEnEdition = null;
  let imageCourante = { chemin: "", donnees: "" };

  /* ---------- Raccourcis DOM ---------- */

  const $ = (id) => document.getElementById(id);

  const champs = {
    owner: $("f-owner"), repo: $("f-repo"), branche: $("f-branche"), jeton: $("f-jeton"),
    id: $("f-id"), titre: $("f-titre"), description: $("f-description"),
    lien: $("f-lien"), image: $("f-image")
  };

  /* ==========================================================================
     Outils
     ========================================================================== */

  function encoderBase64(texte) {
    const octets = new TextEncoder().encode(texte);
    let binaire = "";
    const tranche = 0x8000;
    for (let i = 0; i < octets.length; i += tranche) {
      binaire += String.fromCharCode.apply(null, octets.subarray(i, i + tranche));
    }
    return btoa(binaire);
  }

  function decoderBase64(b64) {
    const binaire = atob(String(b64).replace(/\s/g, ""));
    const octets = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    return new TextDecoder().decode(octets);
  }

  function glisser(texte) {
    return normaliser(texte)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "projet";
  }

  function afficher(element, type, html) {
    element.className = `bandeau bandeau--${type}`;
    element.innerHTML = html;
    element.hidden = false;
  }

  function masquer(element) { element.hidden = true; }

  function journaliser(ligne) {
    const j = $("journal");
    j.hidden = false;
    j.textContent += (j.textContent ? "\n" : "") + ligne;
    j.scrollTop = j.scrollHeight;
  }

  function viderJournal() {
    const j = $("journal");
    j.textContent = "";
    j.hidden = true;
  }

  /* ==========================================================================
     Mémoire locale
     ========================================================================== */

  function chargerDepot() {
    try {
      Object.assign(depot, JSON.parse(localStorage.getItem(CLE_DEPOT) || "{}"));
    } catch { /* réglages illisibles : on repart des valeurs par défaut */ }

    // Devine le dépôt à partir de l'adresse : sbergeronencp002.github.io/robot
    if (!depot.owner || !depot.repo) {
      const hote = window.location.hostname.match(/^([\w-]+)\.github\.io$/i);
      const premier = window.location.pathname.split("/").filter(Boolean)[0];
      if (hote) {
        depot.owner = depot.owner || hote[1];
        depot.repo = depot.repo || (premier && !/\.html?$/i.test(premier) ? premier : `${hote[1]}.github.io`);
      }
    }

    champs.owner.value = depot.owner || "";
    champs.repo.value = depot.repo || "";
    champs.branche.value = depot.branche || "main";
    champs.jeton.value = depot.jeton || "";
  }

  function enregistrerDepot() {
    try { localStorage.setItem(CLE_DEPOT, JSON.stringify(depot)); }
    catch { /* mode privé : les réglages ne survivront pas à la session */ }
  }

  function enregistrerBrouillon() {
    try {
      localStorage.setItem(CLE_BROUILLON, JSON.stringify({ projets, shaJson, imagesEnAttente, modifie }));
    } catch {
      afficher($("bandeau-publication"), "erreur",
        "<strong>Sauvegarde locale impossible</strong><p>La mémoire du navigateur est pleine. Publiez maintenant pour ne rien perdre.</p>");
    }
  }

  function chargerBrouillon() {
    try {
      const b = JSON.parse(localStorage.getItem(CLE_BROUILLON) || "null");
      if (!b) return false;
      projets = Array.isArray(b.projets) ? b.projets : [];
      shaJson = b.shaJson || null;
      imagesEnAttente = b.imagesEnAttente || {};
      modifie = Boolean(b.modifie);
      return true;
    } catch { return false; }
  }

  /* ==========================================================================
     Appels GitHub
     ========================================================================== */

  async function api(chemin, options = {}) {
    const reponse = await fetch(`https://api.github.com${chemin}`, {
      method: options.method || "GET",
      headers: {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Authorization": `Bearer ${depot.jeton}`,
        ...(options.corps ? { "Content-Type": "application/json" } : {})
      },
      body: options.corps ? JSON.stringify(options.corps) : undefined
    });

    if (reponse.status === 204) return null;

    let donnees = null;
    try { donnees = await reponse.json(); } catch { /* corps vide */ }

    if (!reponse.ok) {
      const erreur = new Error(messageErreur(reponse.status, donnees));
      erreur.statut = reponse.status;
      throw erreur;
    }
    return donnees;
  }

  function messageErreur(statut, donnees) {
    const detail = donnees && donnees.message ? ` (${donnees.message})` : "";
    switch (statut) {
      case 401: return "Jeton refusé. Vérifiez qu’il est bien copié au complet et qu’il n’est pas expiré.";
      case 403: return `Accès refusé. Le jeton doit avoir la permission « Contents : Read and write » sur ce dépôt${detail}`;
      case 404: return "Dépôt, branche ou fichier introuvable. Vérifiez le propriétaire, le nom du dépôt et la branche.";
      case 409: return "Le fichier a changé sur GitHub depuis votre dernier chargement. Utilisez « Recharger depuis le site », puis refaites vos modifications.";
      case 422: return `GitHub a refusé l’envoi${detail}`;
      default:  return `Erreur GitHub ${statut}${detail}`;
    }
  }

  const racineContenu = (chemin) =>
    `/repos/${encodeURIComponent(depot.owner)}/${encodeURIComponent(depot.repo)}/contents/${chemin}`;

  async function lireFichier(chemin) {
    try {
      return await api(`${racineContenu(chemin)}?ref=${encodeURIComponent(depot.branche)}&t=${Date.now()}`);
    } catch (err) {
      if (err.statut === 404) return null;   // fichier pas encore créé
      throw err;
    }
  }

  async function ecrireFichier(chemin, contenuBase64, message, sha) {
    return api(racineContenu(chemin), {
      method: "PUT",
      corps: {
        message,
        content: contenuBase64,
        branch: depot.branche,
        ...(sha ? { sha } : {})
      }
    });
  }

  /* ==========================================================================
     Connexion
     ========================================================================== */

  async function connecter(automatique = false) {
    depot.owner   = champs.owner.value.trim();
    depot.repo    = champs.repo.value.trim();
    depot.branche = champs.branche.value.trim() || "main";
    depot.jeton   = champs.jeton.value.trim();

    if (!depot.owner || !depot.repo || !depot.jeton) {
      afficher($("bandeau-connexion"), "erreur",
        "<strong>Champs manquants</strong><p>Le propriétaire, le nom du dépôt et le jeton sont obligatoires.</p>");
      return;
    }

    afficher($("bandeau-connexion"), "info", "<p>Connexion en cours…</p>");
    $("btn-connexion").disabled = true;

    try {
      const infos = await api(`/repos/${encodeURIComponent(depot.owner)}/${encodeURIComponent(depot.repo)}`);
      enregistrerDepot();
      connecte = true;

      const brouillonEnAttente = modifie;
      // À l'ouverture de la page, on conserve d'office le travail en cours :
      // une boîte de dialogue au chargement serait déroutante.
      let garderLocal = automatique;

      if (brouillonEnAttente && !automatique) {
        garderLocal = window.confirm(
          "Vous avez des modifications non publiées sur cet appareil.\n\n" +
          "OK : les conserver et continuer à travailler dessus.\n" +
          "Annuler : les abandonner et recharger la version du site."
        );
      }

      if (!garderLocal) await chargerDepuisDepot();

      afficher($("bandeau-connexion"), "succes",
        `<strong>Connecté à ${echapper(infos.full_name)}</strong>` +
        `<p>Branche « ${echapper(depot.branche)} ». ${projets.length} projet${projets.length > 1 ? "s" : ""} dans le répertoire.</p>`);

      $("aide-liste").textContent =
        "Chaque enregistrement reste sur cet appareil jusqu’à ce que vous cliquiez sur « Publier sur le site ».";
      $("btn-recharger").disabled = false;
      $("panneau-connexion").open = false;
      rafraichir();
    } catch (err) {
      connecte = false;
      $("panneau-connexion").open = true;
      afficher($("bandeau-connexion"), "erreur", `<strong>Connexion impossible</strong><p>${echapper(err.message)}</p>`);
    } finally {
      $("btn-connexion").disabled = false;
    }
  }

  async function chargerDepuisDepot() {
    const fichier = await lireFichier(CHEMIN_JSON);
    if (fichier) {
      shaJson = fichier.sha;
      try {
        const donnees = JSON.parse(decoderBase64(fichier.content));
        projets = Array.isArray(donnees) ? donnees : [];
      } catch {
        throw new Error("Le fichier data/projets.json du dépôt est illisible. Corrigez-le ou remplacez-le par [] avant de continuer.");
      }
    } else {
      shaJson = null;
      projets = [];
    }
    imagesEnAttente = {};
    modifie = false;
    enregistrerBrouillon();
  }

  /* ==========================================================================
     Images
     ========================================================================== */

  function redimensionner(fichier) {
    return new Promise((resoudre, rejeter) => {
      const lecteur = new FileReader();
      lecteur.onerror = () => rejeter(new Error("Lecture du fichier impossible."));
      lecteur.onload = () => {
        const img = new Image();
        img.onerror = () => rejeter(new Error("Ce fichier n’est pas une image valide."));
        img.onload = () => {
          // Toutes les vignettes sortent au même format : on recadre la plus
          // grande zone possible de l'image d'origine, centrée, puis on
          // redimensionne. Les tuiles du site sont ainsi parfaitement alignées,
          // quelle que soit la photo fournie.
          const largeur = Math.min(LARGEUR_MAX, img.naturalWidth);
          const hauteur = Math.round(largeur / RATIO_TUILE);

          const ratioSource = img.naturalWidth / img.naturalHeight;
          let largeurSource, hauteurSource;
          if (ratioSource > RATIO_TUILE) {
            hauteurSource = img.naturalHeight;                 // image trop large
            largeurSource = hauteurSource * RATIO_TUILE;
          } else {
            largeurSource = img.naturalWidth;                  // image trop haute
            hauteurSource = largeurSource / RATIO_TUILE;
          }
          const xSource = (img.naturalWidth - largeurSource) / 2;
          const ySource = (img.naturalHeight - hauteurSource) / 2;

          const toile = document.createElement("canvas");
          toile.width = largeur;
          toile.height = hauteur;
          const ctx = toile.getContext("2d");
          ctx.fillStyle = "#ffffff";           // aplatit la transparence des PNG
          ctx.fillRect(0, 0, largeur, hauteur);
          ctx.drawImage(img, xSource, ySource, largeurSource, hauteurSource, 0, 0, largeur, hauteur);
          resoudre(toile.toDataURL("image/jpeg", QUALITE_JPEG));
        };
        img.src = lecteur.result;
      };
      lecteur.readAsDataURL(fichier);
    });
  }

  champs.image.addEventListener("change", async () => {
    const fichier = champs.image.files[0];
    if (!fichier) return;
    masquer($("bandeau-formulaire"));
    try {
      const dataURL = await redimensionner(fichier);
      const nom = `${new Date().toISOString().slice(0, 10)}-${glisser(champs.titre.value || "projet")}-${Math.random().toString(36).slice(2, 6)}.jpg`;
      imageCourante = { chemin: `images/${nom}`, donnees: dataURL };
      majApercu();
    } catch (err) {
      afficher($("bandeau-formulaire"), "erreur", `<p>${echapper(err.message)}</p>`);
      champs.image.value = "";
    }
  });

  $("btn-retirer-image").addEventListener("click", () => {
    imageCourante = { chemin: "", donnees: "" };
    champs.image.value = "";
    majApercu();
  });

  /* ==========================================================================
     Formulaire
     ========================================================================== */

  function construireChoix(conteneur, nom, options) {
    if (!conteneur) return;   // même prudence que sur le site public
    conteneur.innerHTML = options.map((o) => `
      <label><input type="radio" name="${nom}" value="${echapper(o.valeur)}"> ${echapper(o.libelle)}</label>
    `).join("");
    conteneur.addEventListener("change", majApercu);
  }

  construireChoix($("choix-cycle"), "cycle", CYCLES.map((c) => ({ valeur: c.id, libelle: c.long })));
  construireChoix($("choix-ensemble"), "ensemble", ENSEMBLES.map((e) => ({ valeur: e.id, libelle: e.nom })));
  construireChoix($("choix-univers"), "univers", UNIVERS.map((u) => ({ valeur: u.id, libelle: `${u.icone} ${u.long}` })));
  construireChoix($("choix-difficulte"), "difficulte", DIFFICULTES.map((d) => ({ valeur: d.id, libelle: `${pastilles(d)} ${d.nom}` })));
  construireChoix($("choix-duree"), "duree", DUREES.map((d) => ({ valeur: String(d.id), libelle: d.detail })));

  const valeurChoix = (nom) => {
    const coche = document.querySelector(`input[name="${nom}"]:checked`);
    return coche ? coche.value : "";
  };

  const cocherChoix = (nom, valeur) => {
    document.querySelectorAll(`input[name="${nom}"]`).forEach((r) => { r.checked = r.value === String(valeur); });
  };

  function ficheDepuisFormulaire() {
    return {
      titre: champs.titre.value.trim(),
      description: champs.description.value.trim(),
      cycle: valeurChoix("cycle"),
      ensemble: valeurChoix("ensemble"),
      univers: valeurChoix("univers"),
      difficulte: valeurChoix("difficulte"),
      duree: Number(valeurChoix("duree")) || null,
      lien: champs.lien.value.trim(),
      image: imageCourante.chemin
    };
  }

  function majApercu() {
    const fiche = ficheDepuisFormulaire();
    const apercu = { ...fiche, titre: fiche.titre || "Titre du projet", description: fiche.description || "La description apparaîtra ici." };
    // L'aperçu affiche l'image en attente directement, avant tout téléversement.
    if (imageCourante.donnees) apercu.image = imageCourante.donnees;
    $("apercu").innerHTML = htmlTuile(apercu, { interactif: false });
    $("btn-retirer-image").hidden = !imageCourante.chemin;

    const n = champs.description.value.length;
    const compteur = $("compteur-description");
    compteur.textContent = `${n} / 200`;
    compteur.classList.toggle("compteur-car--limite", n >= 200);
  }

  champs.titre.addEventListener("input", majApercu);
  champs.description.addEventListener("input", majApercu);
  champs.lien.addEventListener("input", majApercu);

  function reinitialiserFormulaire() {
    idEnEdition = null;
    champs.id.value = "";
    champs.titre.value = "";
    champs.description.value = "";
    champs.lien.value = "";
    champs.image.value = "";
    imageCourante = { chemin: "", donnees: "" };
    cocherChoix("cycle", ""); cocherChoix("ensemble", ""); cocherChoix("univers", ""); cocherChoix("difficulte", ""); cocherChoix("duree", "");
    $("titre-formulaire").textContent = "2 · Nouveau projet";
    $("aide-formulaire").textContent = "Remplissez la fiche. Elle s’affichera telle quelle sur le site.";
    $("btn-enregistrer").textContent = "Ajouter le projet";
    $("btn-annuler").hidden = true;
    masquer($("bandeau-formulaire"));
    majApercu();
    rafraichirListe();
  }

  function editer(id) {
    const projet = projets.find((p) => p.id === id);
    if (!projet) return;
    idEnEdition = id;
    champs.id.value = id;
    champs.titre.value = projet.titre || "";
    champs.description.value = projet.description || "";
    champs.lien.value = projet.lien || "";
    champs.image.value = "";
    imageCourante = {
      chemin: projet.image || "",
      donnees: imagesEnAttente[projet.image] || ""
    };
    cocherChoix("cycle", projet.cycle);
    cocherChoix("ensemble", projet.ensemble);
    cocherChoix("univers", projet.univers);
    cocherChoix("difficulte", projet.difficulte);
    cocherChoix("duree", projet.duree);
    $("titre-formulaire").textContent = "2 · Modifier le projet";
    $("aide-formulaire").textContent = `Vous modifiez « ${projet.titre} ».`;
    $("btn-enregistrer").textContent = "Enregistrer les modifications";
    $("btn-annuler").hidden = false;
    majApercu();
    rafraichirListe();
    $("panneau-projets").open = false;
    $("titre-formulaire").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function valider(fiche) {
    if (!fiche.titre) return "Le titre est obligatoire.";
    if (!fiche.description) return "La description courte est obligatoire.";
    if (!fiche.cycle) return "Choisissez un cycle.";
    if (!fiche.ensemble) return "Choisissez un ensemble de robotique.";
    if (!fiche.univers) return "Choisissez un univers.";
    if (!fiche.difficulte) return "Choisissez un niveau de difficulté.";
    if (!fiche.duree) return "Choisissez une durée.";
    if (fiche.lien && !/^https?:\/\//i.test(fiche.lien)) return "Le lien doit commencer par https://";
    return null;
  }

  $("formulaire").addEventListener("submit", (evenement) => {
    evenement.preventDefault();
    const fiche = ficheDepuisFormulaire();
    const probleme = valider(fiche);
    if (probleme) {
      afficher($("bandeau-formulaire"), "erreur", `<p>${echapper(probleme)}</p>`);
      return;
    }

    if (idEnEdition) {
      const index = projets.findIndex((p) => p.id === idEnEdition);
      const ancienneImage = projets[index].image;
      if (ancienneImage && ancienneImage !== fiche.image && imagesEnAttente[ancienneImage]) {
        delete imagesEnAttente[ancienneImage];   // image jamais publiée : inutile de la garder
      }
      projets[index] = { ...projets[index], ...fiche };
    } else {
      projets.unshift({
        id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        cree: new Date().toISOString(),
        ...fiche
      });
    }

    if (imageCourante.chemin && imageCourante.donnees) {
      imagesEnAttente[imageCourante.chemin] = imageCourante.donnees;
    }

    const etaitEnEdition = Boolean(idEnEdition);
    marquerModifie();
    reinitialiserFormulaire();
    afficher($("bandeau-formulaire"), "succes",
      `<strong>${etaitEnEdition ? "Projet modifié" : "Projet ajouté"}</strong>` +
      "<p>Cliquez sur « Publier sur le site », en haut du panneau 3, pour le rendre visible.</p>");
    afficher($("bandeau-publication"), "attente",
      "<strong>Modifications enregistrées sur cet appareil</strong><p>Cliquez sur « Publier sur le site » pour les rendre visibles.</p>");
  });

  $("btn-annuler").addEventListener("click", reinitialiserFormulaire);

  function supprimer(id) {
    const projet = projets.find((p) => p.id === id);
    if (!projet) return;
    if (!window.confirm(`Supprimer définitivement « ${projet.titre} » du répertoire ?`)) return;
    if (projet.image && imagesEnAttente[projet.image]) delete imagesEnAttente[projet.image];
    projets = projets.filter((p) => p.id !== id);
    if (idEnEdition === id) reinitialiserFormulaire();
    marquerModifie();
    rafraichir();
  }

  function marquerModifie() {
    modifie = true;
    enregistrerBrouillon();
    rafraichirEtat();
  }

  /* ==========================================================================
     Liste et état
     ========================================================================== */

  function rafraichirEtatConnexion() {
    const etiquette = $("etat-connexion");
    etiquette.textContent = connecte ? "connecté" : "non connecté";
    etiquette.className = `etiquette-etat${connecte ? " etiquette-etat--publie" : ""}`;
    $("detail-connexion").textContent = connecte
      ? `${depot.owner}/${depot.repo} · branche ${depot.branche}`
      : "";
  }

  function rafraichirEtat() {
    rafraichirEtatConnexion();

    const n = projets.length;
    $("detail-projets").textContent = n === 0
      ? "aucun projet"
      : `${n} projet${n > 1 ? "s" : ""}`;

    const etiquette = $("etat-publication");
    if (!connecte) {
      etiquette.textContent = "hors ligne";
      etiquette.className = "etiquette-etat";
    } else if (modifie) {
      etiquette.textContent = "modifications non publiées";
      etiquette.className = "etiquette-etat";
    } else {
      etiquette.textContent = "à jour";
      etiquette.className = "etiquette-etat etiquette-etat--publie";
    }
    $("btn-publier").disabled = !connecte || !modifie;
  }

  function rafraichirListe() {
    const liste = $("liste-projets");
    const tries = projets.slice().sort((a, b) => String(b.cree || "").localeCompare(String(a.cree || "")));

    if (!tries.length) {
      liste.innerHTML = `<li style="padding:18px 0;color:var(--gris)">Aucun projet pour l’instant.</li>`;
      return;
    }

    liste.innerHTML = tries.map((p) => {
      const cycle = cycleParId(p.cycle);
      const ensemble = ensembleParId(p.ensemble);
      const univers = universParId(p.univers);
      const niveau = difficulteParId(p.difficulte);
      const source = imagesEnAttente[p.image] || p.image;
      const vignette = source
        ? `<span class="ligne-projet__vignette"><img src="${echapper(source)}" alt=""></span>`
        : `<span class="ligne-projet__vignette" aria-hidden="true">🤖</span>`;
      return `
        <li class="ligne-projet${p.id === idEnEdition ? " ligne-projet--edition" : ""}">
          ${vignette}
          <span class="ligne-projet__infos">
            <span class="ligne-projet__titre">${echapper(p.titre)}</span>
            <span class="ligne-projet__meta">${echapper(cycle ? cycle.court : "—")} · ${echapper(ensemble ? ensemble.nom : "—")} · ${echapper(univers ? univers.court : "—")} · ${echapper(niveau ? niveau.nom : "—")} · ${echapper(p.duree || "—")} min${p.lien ? "" : " · <sans document>"}</span>
          </span>
          <span class="ligne-projet__actions">
            <button type="button" class="bouton bouton--secondaire bouton--petit" data-action="editer" data-id="${echapper(p.id)}">Modifier</button>
            <button type="button" class="bouton bouton--danger bouton--petit" data-action="supprimer" data-id="${echapper(p.id)}">Supprimer</button>
          </span>
        </li>`;
    }).join("");
  }

  $("liste-projets").addEventListener("click", (evenement) => {
    const bouton = evenement.target.closest("button[data-action]");
    if (!bouton) return;
    if (bouton.dataset.action === "editer") editer(bouton.dataset.id);
    else supprimer(bouton.dataset.id);
  });

  function rafraichir() {
    rafraichirListe();
    rafraichirEtat();
  }

  /* ==========================================================================
     Publication
     ========================================================================== */

  async function publier() {
    if (!connecte || !modifie) return;

    $("panneau-projets").open = true;
    $("btn-publier").disabled = true;
    $("btn-recharger").disabled = true;
    viderJournal();
    afficher($("bandeau-publication"), "info", "<strong>Publication en cours…</strong><p>Ne fermez pas cette page.</p>");

    try {
      // 1 · Les images d'abord : le fichier de données doit pouvoir y pointer.
      const chemins = Object.keys(imagesEnAttente);
      for (let i = 0; i < chemins.length; i++) {
        const chemin = chemins[i];
        journaliser(`Image ${i + 1}/${chemins.length} — ${chemin}`);
        const base64 = imagesEnAttente[chemin].split(",")[1];
        const existant = await lireFichier(chemin);
        await ecrireFichier(chemin, base64, `Ajout de l'image ${chemin}`, existant ? existant.sha : null);
        delete imagesEnAttente[chemin];
        enregistrerBrouillon();
      }

      // 2 · Puis le répertoire lui-même.
      journaliser(`Fichier ${CHEMIN_JSON} — ${projets.length} projet(s)`);
      const contenu = JSON.stringify(projets, null, 2) + "\n";
      const resultat = await ecrireFichier(
        CHEMIN_JSON,
        encoderBase64(contenu),
        `Mise à jour du répertoire (${projets.length} projet${projets.length > 1 ? "s" : ""})`,
        shaJson
      );
      shaJson = resultat.content.sha;

      modifie = false;
      enregistrerBrouillon();
      journaliser("Terminé.");

      afficher($("bandeau-publication"), "succes",
        "<strong>Publié</strong><p>Le site public se met à jour dans une minute ou deux. " +
        `<a href="index.html" target="_blank" rel="noopener">Ouvrir le site</a></p>`);
    } catch (err) {
      afficher($("bandeau-publication"), "erreur",
        `<strong>La publication a échoué</strong><p>${echapper(err.message)}</p>` +
        "<p>Vos modifications sont conservées sur cet appareil : corrigez le problème, puis réessayez.</p>");
      journaliser(`ERREUR — ${err.message}`);
    } finally {
      $("btn-recharger").disabled = false;
      rafraichirEtat();
    }
  }

  $("btn-publier").addEventListener("click", (evenement) => {
    evenement.preventDefault();
    evenement.stopPropagation();   // sinon le <summary> replierait le panneau
    publier();
  });

  $("btn-recharger").addEventListener("click", async () => {
    if (modifie && !window.confirm(
      "Vos modifications non publiées seront perdues.\n\nRecharger quand même la version du site ?"
    )) return;
    try {
      await chargerDepuisDepot();
      reinitialiserFormulaire();
      rafraichir();
      afficher($("bandeau-publication"), "info", `<p>Répertoire rechargé : ${projets.length} projet(s).</p>`);
    } catch (err) {
      afficher($("bandeau-publication"), "erreur", `<strong>Rechargement impossible</strong><p>${echapper(err.message)}</p>`);
    }
  });

  $("btn-connexion").addEventListener("click", connecter);

  $("btn-oublier").addEventListener("click", () => {
    if (!window.confirm("Retirer le jeton de ce navigateur ? Vos projets non publiés sont conservés.")) return;
    depot.jeton = "";
    champs.jeton.value = "";
    connecte = false;
    enregistrerDepot();
    $("panneau-connexion").open = true;
    afficher($("bandeau-connexion"), "info", "<p>Jeton retiré de cet appareil.</p>");
    rafraichirEtat();
  });

  window.addEventListener("beforeunload", (evenement) => {
    if (!modifie) return;
    evenement.preventDefault();
    evenement.returnValue = "";
  });

  /* ==========================================================================
     Démarrage
     ========================================================================== */

  chargerDepot();
  chargerBrouillon();
  reinitialiserFormulaire();
  rafraichir();

  if (modifie) {
    afficher($("bandeau-publication"), "attente",
      "<strong>Modifications non publiées</strong><p>Des changements faits sur cet appareil attendent d’être publiés. Publiez-les pour les rendre visibles.</p>");
  }

  if (depot.jeton) {
    // Un jeton est mémorisé : on se connecte seul et le panneau reste replié.
    connecter(true);
  } else {
    // Rien en mémoire : le panneau s'ouvre, c'est la seule chose à faire ici.
    $("panneau-connexion").open = true;
    afficher($("bandeau-connexion"), "info",
      "<p>Renseignez le dépôt et collez votre jeton d’accès pour charger le répertoire.</p>");
  }
})();
