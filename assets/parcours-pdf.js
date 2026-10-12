/* Export PDF du parcours : texte sélectionnable et documents cliquables. */
(() => {
  let chargement;
  async function chargerPDF() {
    if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
    if (!chargement) chargement = new Promise((resolve,reject) => {
      const script=document.createElement("script");
      script.src="https://cdn.jsdelivr.net/npm/jspdf@3.0.3/dist/jspdf.umd.min.js";
      script.onload=()=>window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error("PDF indisponible."));
      script.onerror=()=>{script.remove();chargement=null;reject(new Error("Impossible de charger le générateur PDF. Réessayez."));};
      document.head.append(script);
    });
    return chargement;
  }
  window.creerPDFParcours = function(jsPDF, cycle, ensemble, projets) {
    const doc=new jsPDF({unit:"mm",format:"a4"});
    const marge=18, largeur=174, limite=274;
    let y=20;
    const texte=(valeur,taille=11,gras=false,couleur=[32,44,63])=>{
      doc.setFont("helvetica",gras?"bold":"normal");doc.setFontSize(taille);doc.setTextColor(...couleur);
      const lignes=doc.splitTextToSize(String(valeur),largeur);
      const pas=taille*0.3528*1.4;
      for(const ligne of lignes){if(y+pas>limite){doc.addPage();y=20;}doc.text(ligne,marge,y);y+=pas;}
    };
    doc.setProperties({title:"Parcours robotique — "+cycle+" — "+ensemble,author:"Centre de services scolaire des Bois-Francs"});
    texte("Centre de services scolaire des Bois-Francs",10,false,[85,100,120]);y+=3;
    texte("Mon parcours robotique",22,true,[22,39,74]);y+=2;
    texte(cycle+" · "+ensemble,13,true);y+=4;
    texte("Une progression proposée à adapter au rythme de votre classe.",10);y+=7;
    projets.forEach((p,i)=>{
      doc.setFont("helvetica","bold");doc.setFontSize(13);
      const titre=doc.splitTextToSize((i+1)+". "+p.titre,largeur);
      doc.setFont("helvetica","normal");doc.setFontSize(11);
      const description=doc.splitTextToSize(p.description||"",largeur);
      const hauteur=titre.length*6.5+description.length*5.5+27;
      if(y+hauteur>limite && hauteur<limite-20){doc.addPage();y=20;}
      texte((i+1)+". "+p.titre,13,true,[22,39,74]);
      if(p.duree)texte(p.duree+" min",9,false,[85,100,120]);
      y+=2;texte(p.description||"",11);y+=3;
      const liens=[["Cahier de l’élève",p.documents?.eleve||p.lien],["Guide de l’enseignant",p.documents?.guide]].filter(([,url])=>{try{return new URL(url).protocol==="https:";}catch{return false;}});
      if(!liens.length)texte("Documents à venir",10,false,[85,100,120]);
      liens.forEach(([libelle,url])=>{
        if(y+6>limite){doc.addPage();y=20;}
        doc.setFontSize(10);doc.setTextColor(28,91,150);doc.textWithLink(libelle,marge,y,{url});y+=6;
      });
      y+=5;doc.setDrawColor(219,226,233);doc.line(marge,y,192,y);y+=8;
    });
    const total=doc.getNumberOfPages();
    for(let page=1;page<=total;page++){
      doc.setPage(page);doc.setFontSize(8);doc.setFont("helvetica","normal");doc.setTextColor(85,100,120);
      doc.textWithLink("Site des projets de robotique",18,286,{url:"https://sbergeronencp002.github.io/robot/"});
      doc.text(page+" / "+total,192,286,{align:"right"});
    }
    return doc;
  };
  window.telechargerPDFParcours = async (cycle,ensemble,projets) => {
    const jsPDF=await chargerPDF();
    const doc=window.creerPDFParcours(jsPDF,cycle,ensemble,projets);
    const nom=("parcours-"+cycle+"-"+ensemble).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g,"-").toLowerCase();
    doc.save(nom+".pdf");
  };
})();
