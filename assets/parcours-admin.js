(async () => {
  const $ = id => document.getElementById(id);
  const status = $('parcours-etat');
  try {
    let [projets, initial] = await Promise.all(['projets','parcours'].map(async nom => { const r = await fetch(`data/${nom}.json`, {cache:'no-store'}); if (!r.ok) throw new Error('Chargement impossible.'); return r.json(); }));
    let configuration = initial;
    let baseDepot = null;
    let cleBrouillon = "robotique.parcours.brouillon";

    let lignes = [];
    let cycleActif='',kitActif='';
    function conserver(){if(!cycleActif||!kitActif)return;configuration[cycleActif] ||= {};configuration[cycleActif][kitActif]=lignes;try{localStorage.setItem(cleBrouillon,JSON.stringify(configuration));status.textContent='Brouillon enregistré.';}catch(_){status.textContent='Enregistrement impossible.'}}
    const disponibles = () => projets.filter(p => listeValeurs(p.cycle).includes($('parcours-cycle').value) && p.ensemble === $('parcours-kit').value);
    const lire = () => Array.from($('parcours-lignes').children).map(l => ({projet:l.querySelector('select').value,intention:disponibles().find(p=>p.id===l.querySelector('select').value)?.description || ''}));
    function deplacer(depart, position) {
      if (depart === position) return;
      const [projet] = lignes.splice(depart, 1);
      lignes.splice(position, 0, projet);
      conserver(); rendre();
      status.textContent = 'Projet déplacé à la position ' + (position + 1) + '. Brouillon enregistré.';
      $('parcours-lignes').children[position]?.querySelector('.parcours-poignee').focus();
    }
    function rendre() {
      $('parcours-lignes').replaceChildren();
      const choix = disponibles();
      lignes.forEach((e,i) => {
        const ligne = document.createElement('div'); ligne.className='parcours-admin-ligne';
        const poignee = document.createElement('button');
        poignee.type='button';poignee.className='parcours-poignee';poignee.textContent='⋮⋮';
        poignee.setAttribute('aria-label','Déplacer le projet '+(i+1));
        poignee.title='Glisser pour déplacer · flèches haut/bas au clavier';
        poignee.onkeydown=event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();const cible=i+(event.key==='ArrowUp'?-1:1);if(cible>=0&&cible<lignes.length)deplacer(i,cible);}};
        poignee.onpointerdown=event=>{
          if(event.button!==0)return;
          event.preventDefault();poignee.setPointerCapture(event.pointerId);
          ligne.classList.add('parcours-en-deplacement');
          let destination=i;
          const nettoyer=()=>{ligne.classList.remove('parcours-en-deplacement');$('parcours-lignes').querySelectorAll('.parcours-cible').forEach(e=>e.classList.remove('parcours-cible'));poignee.onpointermove=null;poignee.onpointerup=null;poignee.onpointercancel=null;poignee.onlostpointercapture=null;};
          poignee.onpointermove=e=>{
            const autres=Array.from($('parcours-lignes').children).filter(x=>x!==ligne);
            destination=autres.filter(x=>{const r=x.getBoundingClientRect();return e.clientY>r.top+r.height/2;}).length;
            $('parcours-lignes').querySelectorAll('.parcours-cible').forEach(x=>x.classList.remove('parcours-cible'));
            const cible=autres[Math.min(destination,autres.length-1)];if(cible)cible.classList.add('parcours-cible');
            if(e.clientY<70)window.scrollBy(0,-16);else if(e.clientY>window.innerHeight-70)window.scrollBy(0,16);
          };
          poignee.onpointerup=()=>{nettoyer();deplacer(i,destination);};
          poignee.onpointercancel=nettoyer;poignee.onlostpointercapture=nettoyer;
        };
        ligne.append(poignee);
        const titre = document.createElement('h3'); titre.textContent=`Étape ${i+1}`; ligne.append(titre);
        const label = document.createElement('label'); label.textContent='Projet';
        const select = document.createElement('select'); select.add(new Option('Choisir un projet','')); choix.filter(p=>p.id===e.projet||!lignes.some(e=>e.projet===p.id)).forEach(p=>select.add(new Option(p.titre,p.id))); select.value=e.projet; label.append(select); ligne.append(label);
        select.onchange=()=>{lignes=lire();conserver();rendre();};
        const actions = document.createElement('div'); actions.className='barre-boutons';
        [[-1,'↑ Monter'],[1,'↓ Descendre']].forEach(([delta,nom]) => { const b=document.createElement('button');b.type='button';b.className='bouton';b.textContent=nom;b.disabled=i+delta<0 || i+delta>=lignes.length;b.onclick=()=>{lignes=lire();[lignes[i],lignes[i+delta]]=[lignes[i+delta],lignes[i]];conserver();rendre();$('parcours-lignes').children[i+delta].querySelector('select').focus();};actions.append(b); });const retirer=document.createElement('button');retirer.type='button';retirer.className='bouton';retirer.textContent='×';retirer.setAttribute('aria-label','Retirer le projet '+(i+1));retirer.onclick=()=>{lignes.splice(i,1);conserver();rendre();};actions.append(retirer);ligne.append(actions);$('parcours-lignes').append(ligne);
      });
    }
    function charger(){cycleActif=$('parcours-cycle').value;kitActif=$('parcours-kit').value;lignes=(configuration[cycleActif]?.[kitActif]||[]).map(e=>({...e}));rendre();status.textContent='';}
    $('parcours-ajouter').onclick=()=>{const p=disponibles().find(p=>!lignes.some(e=>e.projet===p.id));if(!p||lignes.length>=10)return;lignes.push({projet:p.id,intention:p.description||''});conserver();rendre();};

    function kits() { const avant=$('parcours-kit').value;$('parcours-kit').replaceChildren();ENSEMBLES.filter(e=>projets.some(p=>listeValeurs(p.cycle).includes($('parcours-cycle').value)&&p.ensemble===e.id)).forEach(e=>$('parcours-kit').add(new Option(e.nom,e.id)));if(Array.from($('parcours-kit').options).some(o=>o.value===avant))$('parcours-kit').value=avant;charger(); }
    function enregistrer() {
      const selection=lire();const autorises=new Set(disponibles().map(p=>p.id));
      if(selection.some(e=>!autorises.has(e.projet))){status.textContent='Choisissez un projet pour chaque étape.';return false;}
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
          if (!Array.isArray(etapes) || etapes.length > 10 || new Set(etapes.map(e=>e.projet)).size !== etapes.length || etapes.some(e=>!projets.some(p=>p.id===e.projet && p.ensemble===kit && listeValeurs(p.cycle).includes(cycle)))) throw new Error("Un parcours contient un projet incompatible ou supprimé. Corrigez-le avant de publier.");
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
