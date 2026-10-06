/* ==========================================================================
   Administration : édition des projets et publication vers GitHub.

   Fonctionnement : on travaille sur une copie locale du répertoire
   (conservée dans ce navigateur), puis « Publier » crée un seul commit avec
   les images en attente et le fichier de données. GitHub Pages régénère
   ensuite le site public en une minute ou deux.
   ========================================================================== */

(function () {
  "use strict";

  const CLE_DEPOT    = "robotique.depot";
  const CLE_JETON    = "robotique.jeton.session";
  const CLE_JETON_LOCAL = "robotique.jeton.local";
  const CLE_BROUILLON = "robotique.brouillon";
  const CHEMIN_JSON  = "data/projets.json";
  const LARGEUR_TUILE = 1000;
  const HAUTEUR_TUILE = 625;
  const RATIO_TUILE  = 16 / 10; // toutes les vignettes sont recadrées à ce format
  const TAILLE_SOURCE_MAX = 25 * 1024 * 1024;
  const TAILLE_CIBLE = 90 * 1024;
  const QUALITES_IMAGE = [0.78, 0.68, 0.58];

  /* ---------- État ---------- */

  const depot = { owner: "", repo: "", branche: "main", jeton: "" };

  let projets = [];            // copie de travail
  let projetsBase = null;      // version chargée, nécessaire à une fusion sans perte
  let shaJson = null;          // empreinte du fichier tel qu'il est sur GitHub
  let imagesEnAttente = {};    // chemin -> dataURL, pas encore téléversées
  let modifie = false;         // des changements non publiés ?
  let connecte = false;
  let cibleBrouillon = null;
  let publicationEnCours = false;
  let publicationIncertaine = false;
  let idEnEdition = null;
  let imageCourante = { chemin: "", donnees: "" };

  /* ---------- Raccourcis DOM ---------- */

  const $ = (id) => document.getElementById(id);

  const champs = {
    owner: $("f-owner"), repo: $("f-repo"), branche: $("f-branche"), jeton: $("f-jeton"),
    memoriserJeton: $("f-memoriser-jeton"),
    id: $("f-id"), titre: $("f-titre"), description: $("f-description"),
    lienEleve: $("f-lien-eleve"), lienGuide: $("f-lien-guide"), image: $("f-image")
  };

  /* ==========================================================================
     Outils
     ========================================================================== */

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

  function tailleLisible(octets) {
    if (octets < 1024) return `${octets} octets`;
    if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} ko`;
    return `${(octets / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
  }

  function copier(valeur) {
    return JSON.parse(JSON.stringify(valeur));
  }

  function cibleActuelle() {
    return { owner: depot.owner, repo: depot.repo, branche: depot.branche || "main" };
  }

  function memeCible(a, b) {
    if (!a || !b) return false;
    return String(a.owner).toLowerCase() === String(b.owner).toLowerCase() &&
      String(a.repo).toLowerCase() === String(b.repo).toLowerCase() &&
      String(a.branche || "main") === String(b.branche || "main");
  }

  function nomCible(cible) {
    return `${cible.owner}/${cible.repo} · branche ${cible.branche || "main"}`;
  }

  /* ==========================================================================
     Mémoire locale
     ========================================================================== */

  function chargerDepot() {
    try {
      Object.assign(depot, JSON.parse(localStorage.getItem(CLE_DEPOT) || "{}"));
      const jetonLocal = localStorage.getItem(CLE_JETON_LOCAL) || "";
      depot.jeton = jetonLocal || sessionStorage.getItem(CLE_JETON) || depot.jeton || "";
      champs.memoriserJeton.checked = Boolean(jetonLocal);
      // Le jeton reste séparé des réglages généraux du dépôt.
      const reglagesSansJeton = { owner: depot.owner, repo: depot.repo, branche: depot.branche };
      localStorage.setItem(CLE_DEPOT, JSON.stringify(reglagesSansJeton));
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
    try {
      localStorage.setItem(CLE_DEPOT, JSON.stringify({ owner: depot.owner, repo: depot.repo, branche: depot.branche }));
      if (depot.jeton && champs.memoriserJeton.checked) {
        localStorage.setItem(CLE_JETON_LOCAL, depot.jeton);
        sessionStorage.removeItem(CLE_JETON);
      } else {
        localStorage.removeItem(CLE_JETON_LOCAL);
        if (depot.jeton) sessionStorage.setItem(CLE_JETON, depot.jeton);
        else sessionStorage.removeItem(CLE_JETON);
      }
    }
    catch { /* mode privé : les réglages ne survivront pas à la session */ }
  }

  function enregistrerBrouillon() {
    try {
      localStorage.setItem(CLE_BROUILLON, JSON.stringify({
        cible: cibleBrouillon || cibleActuelle(),
        projets,
        projetsBase,
        shaJson,
        imagesEnAttente,
        modifie
      }));
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
      projetsBase = Array.isArray(b.projetsBase) ? b.projetsBase : null;
      shaJson = b.shaJson || null;
      imagesEnAttente = b.imagesEnAttente || {};
      modifie = Boolean(b.modifie);
      // Les anciens brouillons n'enregistraient pas leur destination. Ils ne
      // peuvent provenir que du dépôt mémorisé par cette version de l'outil.
      cibleBrouillon = b.cible || cibleActuelle();
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
      case 422:
        return donnees && /fast.?forward/i.test(donnees.message || "")
          ? "Une autre publication est survenue pendant l’envoi. Rechargez les projets, puis réessayez."
          : `GitHub a refusé l’envoi${detail}`;
      default:  return `Erreur GitHub ${statut}${detail}`;
    }
  }

  const racineContenu = (chemin) =>
    `/repos/${encodeURIComponent(depot.owner)}/${encodeURIComponent(depot.repo)}/contents/${chemin}`;

  async function lireFichier(chemin, revision = depot.branche) {
    try {
      return await api(`${racineContenu(chemin)}?ref=${encodeURIComponent(revision)}&t=${Date.now()}`);
    } catch (err) {
      if (err.statut === 404) return null;   // fichier pas encore créé
      throw err;
    }
  }

  /* ==========================================================================
     Connexion
     ========================================================================== */

  async function connecter(automatique = false) {
    const cibleDemandee = {
      owner: champs.owner.value.trim(),
      repo: champs.repo.value.trim(),
      branche: champs.branche.value.trim() || "main"
    };
    const jetonDemande = champs.jeton.value.trim();

    if (!cibleDemandee.owner || !cibleDemandee.repo || !jetonDemande) {
      afficher($("bandeau-connexion"), "erreur",
        "<strong>Champs manquants</strong><p>Le propriétaire, le nom du dépôt et le jeton sont obligatoires.</p>");
      return;
    }

    if (modifie && cibleBrouillon && !memeCible(cibleBrouillon, cibleDemandee)) {
      afficher($("bandeau-connexion"), "erreur",
        "<strong>Ce brouillon appartient à un autre dépôt</strong>" +
        `<p>Il est associé à ${echapper(nomCible(cibleBrouillon))}. Publiez-le à cet endroit ou abandonnez-le avant de changer de destination.</p>`);
      return;
    }

    depot.owner = cibleDemandee.owner;
    depot.repo = cibleDemandee.repo;
    depot.branche = cibleDemandee.branche;
    depot.jeton = jetonDemande;

    afficher($("bandeau-connexion"), "info", "<p>Connexion en cours…</p>");
    $("btn-connexion").disabled = true;

    try {
      const infos = await api(`/repos/${encodeURIComponent(depot.owner)}/${encodeURIComponent(depot.repo)}`);
      if (infos.permissions && infos.permissions.push === false) {
        throw new Error("Ce jeton peut lire le dépôt, mais il ne peut pas y publier. Accordez-lui la permission « Contents : Read and write ».");
      }
      enregistrerDepot();
      connecte = true;

      const brouillonEnAttente = modifie;
      // À l'ouverture de la page, on conserve d'office le travail en cours :
      // une boîte de dialogue au chargement serait déroutante.
      let garderLocal = automatique && brouillonEnAttente;

      if (brouillonEnAttente && !automatique) {
        garderLocal = window.confirm(
          "Vous avez des modifications non publiées sur cet appareil.\n\n" +
          "OK : les conserver et continuer à travailler dessus.\n" +
          "Annuler : les abandonner et recharger la version du site."
        );
      }

      if (!garderLocal) await chargerDepuisDepot();
      else await assurerBaseChargee();

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
    projetsBase = copier(projets);
    cibleBrouillon = cibleActuelle();
    imagesEnAttente = {};
    modifie = false;
    publicationIncertaine = false;
    enregistrerBrouillon();
  }

  async function assurerBaseChargee() {
    if (Array.isArray(projetsBase)) return;
    if (!shaJson) {
      projetsBase = [];
      return;
    }
    const blob = await api(
      `/repos/${encodeURIComponent(depot.owner)}/${encodeURIComponent(depot.repo)}/git/blobs/${encodeURIComponent(shaJson)}`
    );
    try {
      const donnees = JSON.parse(decoderBase64(blob.content));
      if (!Array.isArray(donnees)) throw new Error();
      projetsBase = donnees;
      enregistrerBrouillon();
    } catch {
      throw new Error("La version d’origine du brouillon ne peut pas être relue. Rechargez le site avant de publier.");
    }
  }

  /* ==========================================================================
     Images
     ========================================================================== */

  function toileVersBlob(toile, qualite) {
    return new Promise((resoudre, rejeter) => {
      toile.toBlob(
        (blob) => blob ? resoudre(blob) : rejeter(new Error("La compression de l’image a échoué.")),
        "image/webp",
        qualite
      );
    });
  }

  function blobVersDataURL(blob) {
    return new Promise((resoudre, rejeter) => {
      const lecteur = new FileReader();
      lecteur.onerror = () => rejeter(new Error("La préparation de l’image a échoué."));
      lecteur.onload = () => resoudre(lecteur.result);
      lecteur.readAsDataURL(blob);
    });
  }

  function redimensionner(fichier) {
    return new Promise((resoudre, rejeter) => {
      if (fichier.size > TAILLE_SOURCE_MAX) {
        rejeter(new Error(`L’image dépasse ${tailleLisible(TAILLE_SOURCE_MAX)}. Choisissez un fichier plus léger.`));
        return;
      }
      const lecteur = new FileReader();
      lecteur.onerror = () => rejeter(new Error("Lecture du fichier impossible."));
      lecteur.onload = () => {
        const img = new Image();
        img.onerror = () => rejeter(new Error("Ce fichier n’est pas une image valide."));
        img.onload = async () => {
          // Toutes les vignettes sortent au même format : on recadre la plus
          // grande zone possible de l'image d'origine, centrée, puis on
          // redimensionne. Les tuiles du site sont ainsi parfaitement alignées,
          // quelle que soit la photo fournie.
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
          toile.width = LARGEUR_TUILE;
          toile.height = HAUTEUR_TUILE;
          const ctx = toile.getContext("2d");
          ctx.fillStyle = "#ffffff";           // aplatit la transparence des PNG
          ctx.fillRect(0, 0, LARGEUR_TUILE, HAUTEUR_TUILE);
          ctx.drawImage(
            img,
            xSource, ySource, largeurSource, hauteurSource,
            0, 0, LARGEUR_TUILE, HAUTEUR_TUILE
          );

          try {
            let blob;
            for (const qualite of QUALITES_IMAGE) {
              blob = await toileVersBlob(toile, qualite);
              if (blob.size <= TAILLE_CIBLE) break;
            }
            resoudre({
              dataURL: await blobVersDataURL(blob),
              tailleFinale: blob.size,
              tailleOriginale: fichier.size
            });
          } catch (err) {
            rejeter(err);
          }
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
    $("info-image").textContent = "Optimisation de l’image en cours…";
    $("btn-enregistrer").disabled = true;
    try {
      const resultat = await redimensionner(fichier);
      const nom = `${new Date().toISOString().slice(0, 10)}-${glisser(champs.titre.value || "projet")}-${Math.random().toString(36).slice(2, 6)}.webp`;
      imageCourante = { chemin: `images/${nom}`, donnees: resultat.dataURL };
      $("info-image").textContent =
        `Image optimisée : ${LARGEUR_TUILE} × ${HAUTEUR_TUILE} px · ${tailleLisible(resultat.tailleFinale)}` +
        ` (originale : ${tailleLisible(resultat.tailleOriginale)}).`;
      majApercu();
    } catch (err) {
      afficher($("bandeau-formulaire"), "erreur", `<p>${echapper(err.message)}</p>`);
      champs.image.value = "";
      $("info-image").textContent = "Recadrée et compressée automatiquement à 1000 × 625 px.";
    } finally {
      $("btn-enregistrer").disabled = false;
    }
  });

  $("btn-retirer-image").addEventListener("click", () => {
    imageCourante = { chemin: "", donnees: "" };
    champs.image.value = "";
    $("info-image").textContent = "Recadrée et compressée automatiquement à 1000 × 625 px.";
    majApercu();
  });

  /* ==========================================================================
     Formulaire
     ========================================================================== */

  function construireChoix(conteneur, nom, options, multiple = false) {
    if (!conteneur) return;
    const type = multiple ? "checkbox" : "radio";
    conteneur.innerHTML = options.map((o) => `
      <label><input type="${type}" name="${nom}" value="${echapper(o.valeur)}"> ${echapper(o.libelle)}</label>
    `).join("");
    conteneur.addEventListener("change", majApercu);
  }

  construireChoix($("choix-cycle"), "cycle", CYCLES.map((c) => ({ valeur: c.id, libelle: c.long })), true);
  construireChoix($("choix-ensemble"), "ensemble", ENSEMBLES.map((e) => ({ valeur: e.id, libelle: e.nom })));
  construireChoix($("choix-programmation"), "programmation", PROGRAMMATIONS.map((p) => ({ valeur: p.id, libelle: p.nom })));
  construireChoix($("choix-moteurs"), "moteurs", MOTEURS.map((m) => ({ valeur: m.id, libelle: `${m.icone} ${m.nom}` })));
  construireChoix($("choix-composants"), "composants", COMPOSANTS.map((c) => ({ valeur: c.id, libelle: `${c.icone} ${c.nom}` })), true);
  construireChoix($("choix-univers"), "univers", UNIVERS.map((u) => ({ valeur: u.id, libelle: `${u.icone} ${u.long}` })), true);
  construireChoix($("choix-difficulte"), "difficulte", DIFFICULTES.map((d) => ({ valeur: d.id, libelle: `${pastilles(d)} ${d.nom}` })));
  construireChoix($("choix-duree"), "duree", DUREES.map((d) => ({ valeur: String(d.id), libelle: d.detail })));

  const valeurChoix = (nom) => {
    const coche = document.querySelector(`input[name="${nom}"]:checked`);
    return coche ? coche.value : "";
  };

  const valeursChoix = (nom) =>
    Array.from(document.querySelectorAll(`input[name="${nom}"]:checked`), (caseCochee) => caseCochee.value);

  const cocherChoix = (nom, valeur) => {
    const valeurs = listeValeurs(valeur);
    document.querySelectorAll(`input[name="${nom}"]`).forEach((r) => {
      r.checked = valeurs.includes(r.value);
    });
  };


  function ficheDepuisFormulaire() {
    return {
      titre: champs.titre.value.trim(),
      description: champs.description.value.trim(),
      cycle: valeursChoix("cycle"),
      ensemble: valeurChoix("ensemble"),
      programmation: valeurChoix("programmation"),
      moteurs: Number(valeurChoix("moteurs")),
      composants: valeursChoix("composants"),
      univers: valeursChoix("univers"),
      difficulte: valeurChoix("difficulte"),
      duree: Number(valeurChoix("duree")) || null,
      documents: {
        eleve: champs.lienEleve.value.trim(),
        guide: champs.lienGuide.value.trim()
      },
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

    [
      [champs.titre, $("compteur-titre"), 90],
      [champs.description, $("compteur-description"), 100]
    ].forEach(([champ, compteur, limite]) => {
      const n = champ.value.length;
      compteur.textContent = `${n} / ${limite}`;
      compteur.classList.toggle("compteur-car--limite", n >= limite);
    });
  }

  champs.titre.addEventListener("input", majApercu);
  champs.description.addEventListener("input", majApercu);
  function verifierLienSharePoint(url) {
    const brut = String(url || "").trim();
    if (!brut) return { valide: true, vide: true };
    try {
      const adresse = new URL(brut);
      const hoteValide = adresse.protocol === "https:" && adresse.hostname.endsWith(".sharepoint.com");
      return hoteValide
        ? { valide: true, adresse: adresse.href }
        : { valide: false, message: "Utilisez un lien de partage SharePoint sécurisé (https://…sharepoint.com/…)." };
    } catch {
      return { valide: false, message: "Le lien SharePoint n’est pas valide." };
    }
  }

  function configurerLienDocument(champ, boutonId, etatId, nomDocument) {
    champ.addEventListener("input", () => {
      $(etatId).hidden = true;
      majApercu();
    });

    $(boutonId).addEventListener("click", () => {
      const verification = verifierLienSharePoint(champ.value);
      const etatLien = $(etatId);
      if (verification.vide) {
        etatLien.textContent = `Collez d’abord le lien du ${nomDocument}.`;
        etatLien.className = "verification-lien verification-lien--erreur";
        etatLien.hidden = false;
        return;
      }
      if (!verification.valide) {
        etatLien.textContent = verification.message;
        etatLien.className = "verification-lien verification-lien--erreur";
        etatLien.hidden = false;
        return;
      }
      etatLien.textContent = "Le lien a le bon format. Vérifiez que le document s’ouvre sans demander d’autorisation.";
      etatLien.className = "verification-lien verification-lien--succes";
      etatLien.hidden = false;
      window.open(verification.adresse, "_blank", "noopener,noreferrer");
    });
  }

  configurerLienDocument(champs.lienEleve, "btn-tester-lien-eleve", "etat-lien-eleve", "cahier de l’élève");
  configurerLienDocument(champs.lienGuide, "btn-tester-lien-guide", "etat-lien-guide", "guide pédagogique");

  function reinitialiserFormulaire() {
    idEnEdition = null;
    champs.id.value = "";
    champs.titre.value = "";
    champs.description.value = "";
    champs.lienEleve.value = "";
    champs.lienGuide.value = "";
    champs.image.value = "";
    imageCourante = { chemin: "", donnees: "" };
    $("info-image").textContent = "Recadrée et compressée automatiquement à 1000 × 625 px.";
    cocherChoix("cycle", ""); cocherChoix("ensemble", ""); cocherChoix("programmation", ""); cocherChoix("moteurs", "0"); cocherChoix("composants", ""); cocherChoix("univers", ""); cocherChoix("difficulte", ""); cocherChoix("duree", "");
    $("titre-formulaire").textContent = "2 · Nouveau projet";
    $("aide-formulaire").textContent = "Remplissez la fiche. Elle s’affichera telle quelle sur le site.";
    $("btn-enregistrer").textContent = "Ajouter le projet";
    $("btn-annuler").hidden = true;
    masquer($("bandeau-formulaire"));
    $("etat-lien-eleve").hidden = true;
    $("etat-lien-guide").hidden = true;
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
    champs.lienEleve.value = projet.documents?.eleve || projet.lien || "";
    champs.lienGuide.value = projet.documents?.guide || "";
    champs.image.value = "";
    imageCourante = {
      chemin: projet.image || "",
      donnees: imagesEnAttente[projet.image] || ""
    };
    $("info-image").textContent = projet.image
      ? "Image actuelle conservée. Choisissez un fichier pour la remplacer."
      : "Recadrée et compressée automatiquement à 1000 × 625 px.";
    cocherChoix("cycle", projet.cycle);
    cocherChoix("ensemble", projet.ensemble);
    cocherChoix("programmation", projet.programmation || programmationParDefaut(projet.ensemble));
    cocherChoix("moteurs", String(projet.moteurs || 0));
    cocherChoix("composants", projet.composants);
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

  function dupliquer(id) {
    const projet = projets.find((p) => p.id === id);
    if (!projet) return;

    const suffixe = " — copie";
    const titre = `${String(projet.titre || "").slice(0, 90 - suffixe.length).trimEnd()}${suffixe}`;
    idEnEdition = null;
    champs.id.value = "";
    champs.titre.value = titre;
    champs.description.value = projet.description || "";
    champs.lienEleve.value = projet.documents?.eleve || projet.lien || "";
    champs.lienGuide.value = projet.documents?.guide || "";
    champs.image.value = "";
    imageCourante = {
      chemin: projet.image || "",
      donnees: imagesEnAttente[projet.image] || ""
    };
    $("info-image").textContent = projet.image
      ? "La copie réutilisera l’image actuelle. Choisissez un fichier pour la remplacer."
      : "Recadrée et compressée automatiquement à 1000 × 625 px.";
    cocherChoix("cycle", projet.cycle);
    cocherChoix("ensemble", projet.ensemble);
    cocherChoix("programmation", projet.programmation || programmationParDefaut(projet.ensemble));
    cocherChoix("moteurs", String(projet.moteurs || 0));
    cocherChoix("composants", projet.composants);
    cocherChoix("univers", projet.univers);
    cocherChoix("difficulte", projet.difficulte);
    cocherChoix("duree", projet.duree);
    $("titre-formulaire").textContent = "2 · Dupliquer le projet";
    $("aide-formulaire").textContent = `Vous créez une copie de « ${projet.titre} ». Vérifiez la fiche avant de l’ajouter.`;
    $("btn-enregistrer").textContent = "Ajouter la copie";
    $("btn-annuler").hidden = false;
    masquer($("bandeau-formulaire"));
    majApercu();
    rafraichirListe();
    $("panneau-projets").open = false;
    $("titre-formulaire").scrollIntoView({ behavior: "smooth", block: "start" });
    champs.titre.focus({ preventScroll: true });
    champs.titre.select();
  }

  function valider(fiche) {
    if (!fiche.titre) return "Le titre est obligatoire.";
    if (fiche.titre.length > 90) return "Le titre doit contenir au maximum 90 caractères.";
    if (!fiche.description) return "La description courte est obligatoire.";
    if (fiche.description.length > 100) return "La description courte doit contenir au maximum 100 caractères.";
    if (!fiche.cycle.length) return "Choisissez au moins un cycle.";
    if (!fiche.ensemble) return "Choisissez un ensemble de robotique.";
    if (!fiche.programmation) return "Choisissez le type de programmation.";
    if (!Number.isInteger(fiche.moteurs) || fiche.moteurs < 0 || fiche.moteurs > 3) return "Choisissez le nombre de moteurs.";
    if (!fiche.univers.length) return "Choisissez au moins un univers.";
    if (!fiche.difficulte) return "Choisissez un niveau de difficulté.";
    if (!fiche.duree) return "Choisissez une durée.";
    // Les liens documentaires sont temporairement facultatifs et ne bloquent
    // ni l'enregistrement ni la publication. Les boutons « Tester » restent
    // disponibles pour une vérification manuelle au besoin.
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

  function projetsCorrespondantsRechercheAdmin() {
    const mots = normaliser($("recherche-admin").value).split(/\s+/).filter(Boolean);
    if (!mots.length) return projets;

    return projets.filter((p) => {
      const cycles = listeValeurs(p.cycle).map(cycleParId).filter(Boolean);
      const ensemble = ensembleParId(p.ensemble);
      const programmation = programmationParId(p.programmation || programmationParDefaut(p.ensemble));
      const univers = listeValeurs(p.univers).map(universParId).filter(Boolean);
      const niveau = difficulteParId(p.difficulte);
      const duree = dureeParId(p.duree);
      const texte = normaliser(
        `${p.titre} ${p.description} ${cycles.map((c) => c.long).join(" ")} ` +
        `${ensemble ? ensemble.nom : ""} ${programmation ? programmation.nom : ""} ` +
        `${univers.map((u) => u.long).join(" ")} ${niveau ? niveau.nom : ""} ` +
        `${duree ? `${duree.texte} ${duree.detail}` : ""} ${libellesMateriel(p).join(" ")}`
      );
      return mots.every((mot) => texte.includes(mot));
    });
  }

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
    const nAffiches = projetsCorrespondantsRechercheAdmin().length;
    const rechercheActive = Boolean($("recherche-admin").value.trim());
    $("detail-projets").textContent = n === 0
      ? "aucun projet"
      : rechercheActive
        ? `${nAffiches} sur ${n} projet${n > 1 ? "s" : ""}`
        : `${n} projet${n > 1 ? "s" : ""}`;

    const etiquette = $("etat-publication");
    if (!connecte) {
      etiquette.textContent = "hors ligne";
      etiquette.className = "etiquette-etat";
    } else if (publicationIncertaine) {
      etiquette.textContent = "publication à vérifier";
      etiquette.className = "etiquette-etat";
    } else if (modifie) {
      etiquette.textContent = "modifications non publiées";
      etiquette.className = "etiquette-etat";
    } else {
      etiquette.textContent = "à jour";
      etiquette.className = "etiquette-etat etiquette-etat--publie";
    }
    $("btn-publier").disabled = !connecte || !modifie || publicationEnCours || publicationIncertaine;
  }

  function rafraichirListe() {
    const liste = $("liste-projets");
    const tries = projetsCorrespondantsRechercheAdmin()
      .slice()
      .sort((a, b) => String(b.cree || "").localeCompare(String(a.cree || "")));

    if (!tries.length) {
      liste.innerHTML = `<li style="padding:18px 0;color:var(--gris)">${
        projets.length ? "Aucun projet ne correspond à cette recherche." : "Aucun projet pour l’instant."
      }</li>`;
      return;
    }

    liste.innerHTML = tries.map((p) => {
      const cycles = listeValeurs(p.cycle).map(cycleParId).filter(Boolean);
      const ensemble = ensembleParId(p.ensemble);
      const programmation = programmationParId(p.programmation || programmationParDefaut(p.ensemble));
      const univers = listeValeurs(p.univers).map(universParId).filter(Boolean);
      const niveau = difficulteParId(p.difficulte);
      const materiel = libellesMateriel(p);
      const source = imagesEnAttente[p.image] || p.image;
      const vignette = source
        ? `<span class="ligne-projet__vignette"><img src="${echapper(source)}" alt=""></span>`
        : `<span class="ligne-projet__vignette" aria-hidden="true">🤖</span>`;
      return `
        <li class="ligne-projet${p.id === idEnEdition ? " ligne-projet--edition" : ""}">
          ${vignette}
          <span class="ligne-projet__infos">
            <span class="ligne-projet__titre">${echapper(p.titre)}</span>
            <span class="ligne-projet__meta">${echapper(cycles.length ? cycles.map((c) => c.court).join(", ") : "—")} · ${echapper(ensemble ? ensemble.nom : "—")} · ${echapper(programmation ? programmation.nom : "—")} · ${echapper(univers.length ? univers.map((u) => u.court).join(", ") : "—")} · ${echapper(niveau ? niveau.nom : "—")} · ${echapper(p.duree || "—")} min${materiel.length ? ` · ${echapper(materiel.join(" · "))}` : ""}${(p.documents?.eleve || p.lien) ? "" : " · <sans cahier>"}${p.documents?.guide ? " · guide ✓" : ""}</span>
          </span>
          <span class="ligne-projet__actions">
            <button type="button" class="bouton bouton--secondaire bouton--petit" data-action="dupliquer" data-id="${echapper(p.id)}">Dupliquer</button>
            <button type="button" class="bouton bouton--secondaire bouton--petit" data-action="editer" data-id="${echapper(p.id)}">Modifier</button>
            <button type="button" class="bouton bouton--danger bouton--petit" data-action="supprimer" data-id="${echapper(p.id)}">Supprimer</button>
          </span>
        </li>`;
    }).join("");
  }

  $("liste-projets").addEventListener("click", (evenement) => {
    const bouton = evenement.target.closest("button[data-action]");
    if (!bouton) return;
    if (bouton.dataset.action === "dupliquer") dupliquer(bouton.dataset.id);
    else if (bouton.dataset.action === "editer") editer(bouton.dataset.id);
    else if (bouton.dataset.action === "supprimer") supprimer(bouton.dataset.id);
  });

  $("recherche-admin").addEventListener("input", () => {
    $("btn-effacer-recherche-admin").hidden = !$("recherche-admin").value;
    rafraichir();
  });

  $("btn-effacer-recherche-admin").addEventListener("click", () => {
    $("recherche-admin").value = "";
    $("btn-effacer-recherche-admin").hidden = true;
    rafraichir();
    $("recherche-admin").focus();
  });

  function rafraichir() {
    rafraichirListe();
    rafraichirEtat();
  }

  /* ==========================================================================
     Publication
     ========================================================================== */

  function egaux(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function resumeModifications(base, travail) {
    const parIdBase = new Map(base.map((p) => [p.id, p]));
    const parIdTravail = new Map(travail.map((p) => [p.id, p]));
    let ajoutes = 0;
    let modifies = 0;
    let supprimes = 0;

    parIdTravail.forEach((projet, id) => {
      if (!parIdBase.has(id)) ajoutes++;
      else if (!egaux(projet, parIdBase.get(id))) modifies++;
    });
    parIdBase.forEach((projet, id) => {
      if (!parIdTravail.has(id)) supprimes++;
    });
    return { ajoutes, modifies, supprimes };
  }

  function fusionnerTroisVersions(base, local, distant) {
    const cartes = [base, local, distant].map((liste) => new Map(liste.map((p) => [p.id, p])));
    const [baseParId, localParId, distantParId] = cartes;
    const ordre = Array.from(new Set(local.map((p) => p.id).concat(distant.map((p) => p.id), base.map((p) => p.id))));
    const resultat = [];
    const conflits = [];

    ordre.forEach((id) => {
      const original = baseParId.get(id);
      const versionLocale = localParId.get(id);
      const versionDistante = distantParId.get(id);
      const localModifie = !egaux(versionLocale, original);
      const distantModifie = !egaux(versionDistante, original);
      let versionFinale;

      if (!localModifie) versionFinale = versionDistante;
      else if (!distantModifie || egaux(versionLocale, versionDistante)) versionFinale = versionLocale;
      else {
        conflits.push(versionLocale?.titre || versionDistante?.titre || original?.titre || id);
        return;
      }

      if (versionFinale) resultat.push(versionFinale);
    });

    return { projets: resultat, conflits };
  }

  function verifierRepertoire(liste) {
    if (!Array.isArray(liste)) return "Le répertoire n’est pas une liste valide.";
    const ids = new Set();
    const idsCycles = CYCLES.map((c) => c.id);
    const idsEnsembles = ENSEMBLES.map((e) => e.id);
    const idsProgrammations = PROGRAMMATIONS.map((p) => p.id);
    const idsUnivers = UNIVERS.map((u) => u.id);
    const idsDifficultes = DIFFICULTES.map((d) => d.id);
    const idsDurees = DUREES.map((d) => d.id);
    const idsComposants = COMPOSANTS.map((c) => c.id);

    for (let index = 0; index < liste.length; index++) {
      const p = liste[index];
      const position = `Projet ${index + 1}`;
      if (!p || typeof p !== "object" || Array.isArray(p)) return `${position} : fiche invalide.`;
      if (!p.id || !/^[a-z0-9_-]{3,80}$/i.test(String(p.id))) return `${position} : identifiant invalide.`;
      if (ids.has(p.id)) return `${position} : l’identifiant « ${p.id} » est utilisé deux fois.`;
      ids.add(p.id);

      const fiche = {
        ...p,
        cycle: listeValeurs(p.cycle),
        programmation: p.programmation || programmationParDefaut(p.ensemble),
        moteurs: Number(p.moteurs || 0),
        composants: listeValeurs(p.composants),
        univers: listeValeurs(p.univers),
        duree: Number(p.duree),
        documents: {
          eleve: p.documents?.eleve || p.lien || "",
          guide: p.documents?.guide || ""
        }
      };
      const probleme = valider(fiche);
      if (probleme) return `${p.titre || position} : ${probleme}`;
      if (!fiche.cycle.every((id) => idsCycles.includes(id))) return `${p.titre} : cycle inconnu.`;
      if (!idsEnsembles.includes(fiche.ensemble)) return `${p.titre} : ensemble de robotique inconnu.`;
      if (!idsProgrammations.includes(fiche.programmation)) return `${p.titre} : type de programmation inconnu.`;
      if (!fiche.univers.every((id) => idsUnivers.includes(id))) return `${p.titre} : univers inconnu.`;
      if (!idsDifficultes.includes(fiche.difficulte)) return `${p.titre} : difficulté inconnue.`;
      if (!idsDurees.includes(fiche.duree)) return `${p.titre} : durée inconnue.`;
      if (!fiche.composants.every((id) => idsComposants.includes(id))) return `${p.titre} : composant inconnu.`;
      if (p.image && !/^images\/[a-z0-9._-]+\.webp$/i.test(String(p.image))) {
        return `${p.titre} : le chemin de l’image doit pointer vers un fichier WebP du dossier images.`;
      }
    }

    const imagesUtilisees = new Set(liste.map((p) => p.image).filter(Boolean));
    for (const [chemin, donnees] of Object.entries(imagesEnAttente)) {
      if (!imagesUtilisees.has(chemin)) continue;
      if (!/^data:image\/webp;base64,[a-z0-9+/=]+$/i.test(String(donnees))) {
        return `L’image en attente « ${chemin} » est illisible.`;
      }
    }
    return null;
  }

  async function publier() {
    if (!connecte || !modifie || publicationEnCours || publicationIncertaine) return;

    publicationEnCours = true;
    let miseEnLigneEffectuee = false;

    $("panneau-projets").open = true;
    $("btn-publier").disabled = true;
    $("btn-recharger").disabled = true;
    viderJournal();
    afficher($("bandeau-publication"), "info", "<strong>Publication en cours…</strong><p>Ne fermez pas cette page.</p>");

    try {
      if (!memeCible(cibleBrouillon, cibleActuelle())) {
        throw new Error(`Ce brouillon appartient à ${nomCible(cibleBrouillon)} et ne peut pas être publié ici.`);
      }
      await assurerBaseChargee();
      const problemeInitial = verifierRepertoire(projets);
      if (problemeInitial) throw new Error(`Vérification du répertoire : ${problemeInitial}`);

      const resume = resumeModifications(projetsBase, projets);
      const confirmer = window.confirm(
        `Publier sur ${nomCible(cibleActuelle())} ?\n\n` +
        `${resume.ajoutes} ajout(s) · ${resume.modifies} modification(s) · ${resume.supprimes} suppression(s)\n` +
        `${Object.keys(imagesEnAttente).length} image(s) en attente\n\n` +
        "Tous les fichiers seront publiés ensemble dans un seul commit."
      );
      if (!confirmer) {
        afficher($("bandeau-publication"), "attente",
          "<strong>Publication annulée</strong><p>Vos modifications restent enregistrées sur cet appareil.</p>");
        return;
      }

      // Vérifie d'abord que personne n'a publié une autre version depuis le
      // dernier chargement. La mise à jour finale de la branche protège aussi
      // contre une modification qui surviendrait pendant la préparation.
      journaliser("Vérification de la version publiée");
      const brancheEncodee = depot.branche.split("/").map(encodeURIComponent).join("/");
      const reference = await api(`/repos/${encodeURIComponent(depot.owner)}/${encodeURIComponent(depot.repo)}/git/ref/heads/${brancheEncodee}`);
      const shaParent = reference.object.sha;
      const commitParent = await api(`/repos/${encodeURIComponent(depot.owner)}/${encodeURIComponent(depot.repo)}/git/commits/${shaParent}`);
      // Le fichier est lu au commit exact qui servira de parent. Une mise à
      // jour postérieure fera échouer le déplacement final de la branche.
      const fichierDistant = await lireFichier(CHEMIN_JSON, shaParent);
      const shaDistant = fichierDistant ? fichierDistant.sha : null;
      if (shaDistant !== shaJson) {
        let projetsDistants = [];
        try {
          projetsDistants = fichierDistant ? JSON.parse(decoderBase64(fichierDistant.content)) : [];
          if (!Array.isArray(projetsDistants)) throw new Error();
        } catch {
          throw new Error("La version publiée a changé et son contenu ne peut pas être fusionné automatiquement.");
        }
        const fusion = fusionnerTroisVersions(projetsBase, projets, projetsDistants);
        if (fusion.conflits.length) {
          const noms = fusion.conflits.slice(0, 4).join(", ");
          throw new Error(
            `Conflit détecté pour ${noms}${fusion.conflits.length > 4 ? "…" : ""}. ` +
            "Ces projets ont été modifiés à la fois ici et sur GitHub. Rien n’a été publié."
          );
        }
        projets = fusion.projets;
        projetsBase = copier(projetsDistants);
        shaJson = shaDistant;
        const problemeFusion = verifierRepertoire(projets);
        if (problemeFusion) throw new Error(`Vérification après fusion : ${problemeFusion}`);
        enregistrerBrouillon();
        journaliser("Fusion sécurisée terminée — aucune modification perdue");
      }

      // Prépare tous les fichiers sans rien rendre visible sur la branche.
      const imagesUtilisees = new Set(
        projets.map((p) => String(p.image || "")).filter((chemin) => chemin.startsWith("images/"))
      );
      const imagesDeLaVersionChargee = new Set(
        projetsBase.map((p) => String(p.image || "")).filter((chemin) => chemin.startsWith("images/"))
      );
      const chemins = Object.keys(imagesEnAttente).filter((chemin) => imagesUtilisees.has(chemin));
      const elements = [];

      journaliser("Recherche des images inutilisées");
      const contenuImages = await api(
        `/repos/${encodeURIComponent(depot.owner)}/${encodeURIComponent(depot.repo)}/contents/images?ref=${encodeURIComponent(shaParent)}&t=${Date.now()}`
      );
      const imagesASupprimer = Array.isArray(contenuImages)
        ? contenuImages.filter((fichier) =>
            fichier.type === "file" &&
            fichier.name !== ".gitkeep" &&
            imagesDeLaVersionChargee.has(fichier.path) &&
            !imagesUtilisees.has(fichier.path)
          )
        : [];
      imagesASupprimer.forEach((fichier) => {
        elements.push({ path: fichier.path, mode: "100644", type: "blob", sha: null });
      });
      if (imagesASupprimer.length) {
        journaliser(`${imagesASupprimer.length} image(s) inutilisée(s) seront retirées`);
      }

      for (let i = 0; i < chemins.length; i++) {
        const chemin = chemins[i];
        journaliser(`Préparation de l’image ${i + 1}/${chemins.length}`);
        const base64 = imagesEnAttente[chemin].split(",")[1];
        const blob = await api(`/repos/${encodeURIComponent(depot.owner)}/${encodeURIComponent(depot.repo)}/git/blobs`, {
          method: "POST",
          corps: { content: base64, encoding: "base64" }
        });
        elements.push({ path: chemin, mode: "100644", type: "blob", sha: blob.sha });
      }

      journaliser(`Préparation du répertoire — ${projets.length} projet(s)`);
      const contenu = JSON.stringify(projets, null, 2) + "\n";
      const blobJson = await api(`/repos/${encodeURIComponent(depot.owner)}/${encodeURIComponent(depot.repo)}/git/blobs`, {
        method: "POST",
        corps: { content: contenu, encoding: "utf-8" }
      });
      elements.push({ path: CHEMIN_JSON, mode: "100644", type: "blob", sha: blobJson.sha });

      journaliser("Création de la publication unique");
      const arbre = await api(`/repos/${encodeURIComponent(depot.owner)}/${encodeURIComponent(depot.repo)}/git/trees`, {
        method: "POST",
        corps: { base_tree: commitParent.tree.sha, tree: elements }
      });
      const nouveauCommit = await api(`/repos/${encodeURIComponent(depot.owner)}/${encodeURIComponent(depot.repo)}/git/commits`, {
        method: "POST",
        corps: {
          message: `Mise à jour du répertoire (${projets.length} projet${projets.length > 1 ? "s" : ""})`,
          tree: arbre.sha,
          parents: [shaParent]
        }
      });

      journaliser("Mise en ligne");
      const referenceMiseAJour = await api(`/repos/${encodeURIComponent(depot.owner)}/${encodeURIComponent(depot.repo)}/git/refs/heads/${brancheEncodee}`, {
        method: "PATCH",
        corps: { sha: nouveauCommit.sha, force: false }
      });
      miseEnLigneEffectuee = true;
      if (referenceMiseAJour?.object?.sha !== nouveauCommit.sha) {
        throw new Error("GitHub n’a pas confirmé la nouvelle version de la branche.");
      }

      journaliser("Vérification de la version publiée");
      const fichierVerifie = await api(
        `${racineContenu(CHEMIN_JSON)}?ref=${encodeURIComponent(nouveauCommit.sha)}&t=${Date.now()}`
      );
      if (!fichierVerifie || fichierVerifie.sha !== blobJson.sha) {
        throw new Error("La vérification finale de data/projets.json a échoué.");
      }

      shaJson = blobJson.sha;
      imagesEnAttente = {};
      projetsBase = copier(projets);
      cibleBrouillon = cibleActuelle();
      modifie = false;
      publicationIncertaine = false;
      enregistrerBrouillon();
      journaliser("Terminé.");

      afficher($("bandeau-publication"), "succes",
        "<strong>Publié</strong><p>Le site public se met à jour dans une minute ou deux. " +
        `<a href="index.html" target="_blank" rel="noopener">Ouvrir le site</a></p>`);
    } catch (err) {
      if (miseEnLigneEffectuee) {
        publicationIncertaine = true;
        afficher($("bandeau-publication"), "attente",
          "<strong>Publication envoyée, vérification incomplète</strong>" +
          `<p>${echapper(err.message)}</p>` +
          "<p>Ne republiez pas immédiatement. Utilisez « Recharger depuis le site » pour confirmer la version présente sur GitHub.</p>");
      } else {
        afficher($("bandeau-publication"), "erreur",
          `<strong>La publication a échoué</strong><p>${echapper(err.message)}</p>` +
          "<p>Vos modifications sont conservées sur cet appareil : corrigez le problème, puis réessayez.</p>");
      }
      journaliser(`ERREUR — ${err.message}`);
    } finally {
      publicationEnCours = false;
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
    if (modifie) {
      const message = publicationIncertaine
        ? "Recharger la version présente sur GitHub pour vérifier la publication ?\n\nLa copie locale sera remplacée par la version du site."
        : "Vos modifications non publiées seront perdues.\n\nRecharger quand même la version du site ?";
      if (!window.confirm(message)) return;
    }
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

  champs.memoriserJeton.addEventListener("change", () => {
    if (depot.jeton) enregistrerDepot();
  });

  $("btn-oublier").addEventListener("click", () => {
    if (!window.confirm("Retirer le jeton de ce navigateur ? Vos projets non publiés sont conservés.")) return;
    depot.jeton = "";
    sessionStorage.removeItem(CLE_JETON);
    localStorage.removeItem(CLE_JETON_LOCAL);
    champs.memoriserJeton.checked = false;
    champs.jeton.value = "";
    connecte = false;
    enregistrerDepot();
    $("panneau-connexion").open = true;
    afficher($("bandeau-connexion"), "info", "<p>Jeton retiré de cet appareil.</p>");
    rafraichirEtat();
  });

  window.addEventListener("beforeunload", (evenement) => {
    if (!modifie && !publicationEnCours) return;
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
