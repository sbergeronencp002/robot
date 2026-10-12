(() => {
  const cle="robotique.mon-parcours";
  let catalogue=[], ids=[];
  try {const v=JSON.parse(localStorage.getItem(cle)||"[]");if(Array.isArray(v))ids=[...new Set(v.filter(x=>typeof x==="string"))];}catch(_){}
  const $=id=>document.getElementById(id);
  const dialogue=$("mon-parcours-dialogue"), liste=$("mon-parcours-liste"), etat=$("mon-parcours-etat");
  const selection=()=>ids.map(id=>catalogue.find(p=>p.id===id)).filter(Boolean);
  function sauver(){try{localStorage.setItem(cle,JSON.stringify(ids));etat.textContent="Sélection conservée dans ce navigateur.";}catch(_){etat.textContent="La sélection reste disponible pendant cette visite; ce navigateur ne permet pas sa sauvegarde.";}actualiser();}
  function actualiser(){
    $("mon-parcours-ouvrir").textContent="Mon parcours · "+ids.length;
    document.querySelectorAll("[data-mon-parcours-ajouter]").forEach(b=>{const dedans=ids.includes(b.dataset.monParcoursAjouter);b.textContent=dedans?"Ajouté à mon parcours ✓":"Ajouter à mon parcours";b.disabled=dedans;});
    $("mon-parcours-pdf").disabled=!selection().length;
    $("mon-parcours-vider").disabled=!ids.length;
  }
  function deplacer(depart,cible){if(depart===cible)return;const [id]=ids.splice(depart,1);ids.splice(cible,0,id);sauver();rendre();liste.children[cible]?.querySelector("button").focus();}
  function rendre(){
    liste.replaceChildren();
    selection().forEach((p,i)=>{
      const ligne=document.createElement("li");ligne.className="mon-parcours-ligne";
      const poignee=document.createElement("button");poignee.type="button";poignee.className="mon-parcours-poignee";poignee.textContent="⋮⋮";poignee.setAttribute("aria-label","Déplacer "+p.titre);
      poignee.onkeydown=e=>{if(["ArrowUp","ArrowDown"].includes(e.key)){e.preventDefault();const c=i+(e.key==="ArrowUp"?-1:1);if(c>=0&&c<ids.length)deplacer(i,c);}};
      poignee.onpointerdown=e=>{
        if(e.button!==0)return;e.preventDefault();poignee.setPointerCapture(e.pointerId);ligne.classList.add("mon-parcours-glisse");let cible=i;
        const finir=()=>{ligne.classList.remove("mon-parcours-glisse");poignee.onpointermove=null;poignee.onpointerup=null;poignee.onpointercancel=null;poignee.onlostpointercapture=null;liste.querySelectorAll(".mon-parcours-cible").forEach(l=>l.classList.remove("mon-parcours-cible"));};
        poignee.onpointermove=e=>{const autres=Array.from(liste.children).filter(l=>l!==ligne);cible=autres.filter(l=>{const r=l.getBoundingClientRect();return e.clientY>r.top+r.height/2;}).length;liste.querySelectorAll(".mon-parcours-cible").forEach(l=>l.classList.remove("mon-parcours-cible"));autres[Math.min(cible,autres.length-1)]?.classList.add("mon-parcours-cible");const r=dialogue.getBoundingClientRect();if(e.clientY<r.top+60)dialogue.scrollTop-=16;if(e.clientY>r.bottom-60)dialogue.scrollTop+=16;};
        poignee.onpointerup=()=>{finir();deplacer(i,cible);};poignee.onpointercancel=finir;poignee.onlostpointercapture=finir;
      };
      const contenu=document.createElement("div"), titre=document.createElement("strong"), meta=document.createElement("p");titre.textContent=(i+1)+". "+p.titre;meta.textContent=(ENSEMBLES.find(e=>e.id===p.ensemble)?.nom||p.ensemble)+" · "+listeValeurs(p.cycle).map(c=>CYCLES.find(x=>x.id===c)?.court).filter(Boolean).join(", ");contenu.append(titre,meta);
      const actions=document.createElement("div");actions.className="mon-parcours-actions";
      [[-1,"↑"],[1,"↓"]].forEach(([d,t])=>{const b=document.createElement("button");b.type="button";b.className="bouton";b.textContent=t;b.setAttribute("aria-label",t==="↑"?"Monter "+p.titre:"Descendre "+p.titre);b.disabled=i+d<0||i+d>=ids.length;b.onclick=()=>deplacer(i,i+d);actions.append(b);});
      const retirer=document.createElement("button");retirer.type="button";retirer.className="bouton";retirer.textContent="×";retirer.setAttribute("aria-label","Retirer "+p.titre);retirer.onclick=()=>{ids.splice(i,1);sauver();rendre();};actions.append(retirer);
      ligne.append(poignee,contenu,actions);liste.append(ligne);
    });
    $("mon-parcours-vide").hidden=ids.length>0;actualiser();
  }
  $("mon-parcours-ouvrir").onclick=()=>{rendre();dialogue.showModal();};
  $("mon-parcours-fermer").onclick=()=>dialogue.close();
  $("mon-parcours-vider").onclick=()=>{if(!ids.length || !window.confirm("Retirer tous les projets de votre parcours ?"))return;ids=[];sauver();rendre();etat.textContent="Votre parcours est vide.";};
  dialogue.addEventListener("click",e=>{if(e.target===dialogue){const r=dialogue.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialogue.close();}});
  document.addEventListener("click",e=>{const b=e.target.closest("[data-mon-parcours-ajouter]");if(b)ajouter([b.dataset.monParcoursAjouter]);});
  function ajouter(nouveaux){ids=[...new Set([...ids,...nouveaux.filter(id=>catalogue.some(p=>p.id===id))])];sauver();etat.textContent="Projets ajoutés à votre parcours.";rendre();}
  $("mon-parcours-pdf").onclick=async()=>{const b=$("mon-parcours-pdf");b.disabled=true;b.textContent="Génération du PDF…";try{await window.telechargerPDFParcours("Parcours personnalisé","Mes projets",selection().map(p=>({...p,sousTitre:(ENSEMBLES.find(e=>e.id===p.ensemble)?.nom||p.ensemble)+" · "+listeValeurs(p.cycle).map(c=>CYCLES.find(x=>x.id===c)?.court).filter(Boolean).join(", ")})));etat.textContent="Votre PDF est téléchargé.";}catch(e){etat.textContent=e.message;}finally{b.textContent="Télécharger mon parcours";actualiser();}};
  window.monParcours={initialiser(projets){catalogue=projets;ids=ids.filter(id=>catalogue.some(p=>p.id===id));rendre();},ajouter,actualiser};
  window.addEventListener("storage",e=>{if(e.key===cle){try{const v=JSON.parse(e.newValue||"[]");ids=Array.isArray(v)?[...new Set(v.filter(id=>catalogue.some(p=>p.id===id)))]:[];rendre();}catch(_){}}});
  actualiser();
})();
