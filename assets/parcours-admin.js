(async () => {
  const $ = id => document.getElementById(id);
  const status = $('parcours-etat');
  try {
    let [projets, initial] = await Promise.all(['projets','parcours'].map(async nom => { const r = await fetch(`data/${nom}.json`, {cache:'no-store'}); if (!r.ok) throw new Error('Chargement impossible.'); return r.json(); }));
    let configuration = initial;
    let baseDepot = null;
    let cleBrouillon = "robotique.parcours.brouillon";

    let lignes = [];
    const disponibles = () => projets.filter(p => listeValeurs(p.cycle).includes($('parcours-cycle').value) && p.ensemble === $('parcours-kit').value);
    const lire = () => Array.from($('parcours-lignes').children).map(l => ({projet:l.querySelector('select').value,intention:l.querySelector('textarea').value.trim()}));
    function rendre() {
      $('parcours-lignes').replaceChildren();
      const choix = disponibles();
      lignes.forEach((e,i) => {
        const ligne = document.createElement('div'); ligne.className='panneau';
        const titre = document.createElement('h3'); titre.textContent=`Étape ${i+1}`; ligne.append(titre);
        const label = document.createElement('label'); label.textContent='Projet';
        const select = document.createElement('select'); select.add(new Option('Choisir un projet','')); choix.forEach(p=>select.add(new Option(p.titre,p.id))); select.value=e.projet; label.append(select); ligne.append(label);
        const intention = document.createElement('label'); intention.textContent='Intention pédagogique';
        const texte = document.createElement('textarea'); texte.rows=2; texte.maxLength=300; texte.value=e.intention; intention.append(texte); ligne.append(intention);
        const actions = document.createElement('div'); actions.className='barre-boutons';
        [[-1,'↑ Monter'],[1,'↓ Descendre']].forEach(([delta,nom]) => { const b=document.createElement('button');b.type='button';b.className='bouton';b.textContent=nom;b.disabled=i+delta<0 || i+delta>=lignes.length;b.onclick=()=>{lignes=lire();[lignes[i],lignes[i+delta]]=[lignes[i+delta],lignes[i]];rendre();$('parcours-lignes').children[i+delta].querySelector('select').focus();};actions.append(b); });ligne.append(actions);$('parcours-lignes').append(ligne);
      });
    }
    function charger() { lignes = Array.from({length:Math.min(5, disponibles().length)},(_,i)=>configuration[$('parcours-cycle').value]?.[$('parcours-kit').value]?.[i] || {projet:'',intention:''});rendre();status.textContent=''; }
    function kits() { const avant=$('parcours-kit').value;$('parcours-kit').replaceChildren();ENSEMBLES.filter(e=>projets.some(p=>listeValeurs(p.cycle).includes($('parcours-cycle').value)&&p.ensemble===e.id)).forEach(e=>$('parcours-kit').add(new Option(e.nom,e.id)));if(Array.from($('parcours-kit').options).some(o=>o.value===avant))$('parcours-kit').value=avant;charger(); }
    function enregistrer() {
      const selection=lire();const autorises=new Set(disponibles().map(p=>p.id));
      if(selection.some(e=>!autorises.has(e.projet)||!e.intention)){status.textContent='Choisissez un projet et une intention pédagogique pour chaque étape.';return false;}
      if(new Set(selection.map(e=>e.projet)).size!==selection.length){status.textContent='Choisissez des projets différents.';return false;}
      configuration[$('parcours-cycle').value] ||= {};configuration[$('parcours-cycle').value][$('parcours-kit').value]=selection;
      try {localStorage.setItem(cleBrouillon,JSON.stringify(configuration));status.textContent='Brouillon enregistré. Publiez les parcours pour mettre à jour le site.';return true;}catch(_){status.textContent='Impossible d’enregistrer dans ce navigateur.';return false;}
    }
    $('parcours-recharger').onclick = async () => {
      try {
        baseDepot = await window.robotiqueParcoursDepot.charger();
        projets = baseDepot.projets;
        configuration = baseDepot.configuration;
        cleBrouillon = "robotique.parcours.brouillon." + [baseDepot.cible.owner,baseDepot.cible.repo,baseDepot.cible.branche].join("/");
        const local = localStorage.getItem(cleBrouillon);
        if (local) configuration = JSON.parse(local);
        kits(); status.textContent = local ? "Brouillon restauré. Publiez pour l’appliquer au site." : "Parcours chargés depuis le dépôt.";
      } catch(e) {status.textContent=e.message;}
    };
    $('parcours-publier').onclick = async () => {
      const bouton = $('parcours-publier');
      try {
        if (!baseDepot) throw new Error("Rechargez les parcours depuis le dépôt avant de publier.");
        if (!enregistrer()) return;
        for (const [cycle, ensembles] of Object.entries(configuration)) for (const [kit, etapes] of Object.entries(ensembles)) {
          if (!Array.isArray(etapes) || etapes.length > 5 || new Set(etapes.map(e=>e.projet)).size !== etapes.length || etapes.some(e=>!e.intention || !projets.some(p=>p.id===e.projet && p.ensemble===kit && listeValeurs(p.cycle).includes(cycle)))) throw new Error("Un parcours contient un projet incompatible ou supprimé. Corrigez-le avant de publier.");
        }
        bouton.disabled = true;
        baseDepot = await window.robotiqueParcoursDepot.publier(configuration,baseDepot);
        localStorage.removeItem(cleBrouillon);
        status.textContent = "Parcours publiés. Le site se mettra à jour dans une minute ou deux.";
      } catch(e) { status.textContent=e.message; } finally {bouton.disabled=false;}
    };
    $('parcours-cycle').onchange=kits;$('parcours-kit').onchange=charger;$('parcours-enregistrer').onclick=enregistrer;
    $('parcours-exporter').onclick=()=>{if(!enregistrer())return;const url=URL.createObjectURL(new Blob([JSON.stringify(configuration,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='parcours.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};kits();
  } catch(e){status.textContent=e.message;}
})();
