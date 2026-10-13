/* Export PDF du parcours : texte sélectionnable et documents cliquables. */
(() => {
  window.dureeTotaleParcours = projets => {
    const connues=projets.filter(p=>Number.isFinite(Number(p.duree)) && Number(p.duree)>0);
    const minutes=connues.reduce((total,p)=>total+Number(p.duree),0);
    const h=Math.floor(minutes/60),m=minutes%60;
    const libelle=h ? h+" h"+(m ? " "+m+" min" : "") : minutes+" min";
    const manquantes=projets.length-connues.length;
    return "Durée totale : "+libelle+(manquantes ? " · "+manquantes+" durée"+(manquantes>1?"s":"")+" à préciser" : "");
  };
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
  async function chargerImagePDF(projet) {
    if (!projet.image) return projet;
    const img = new Image();img.crossOrigin="anonymous";
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error("L’image du projet « "+projet.titre+" » n’a pas pu être chargée. Réessayez."));img.src=new URL(projet.image,window.location.href).href;});
    const ratio=img.naturalWidth/img.naturalHeight;
    const canvas=document.createElement("canvas");
    canvas.width=Math.min(900,img.naturalWidth);canvas.height=Math.max(1,Math.round(canvas.width/ratio));
    canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
    return {...projet,imagePDF:{data:canvas.toDataURL("image/png"),ratio}};
  }
  window.creerPDFParcours = function(jsPDF, cycle, ensemble, projets) {
    const doc=new jsPDF({unit:"mm",format:"a4"});
    const marge=18, limite=274;
    let largeur=174, x=marge;
    let y=20;
    const texte=(valeur,taille=11,gras=false,couleur=[32,44,63])=>{
      doc.setFont("helvetica",gras?"bold":"normal");doc.setFontSize(taille);doc.setTextColor(...couleur);
      const lignes=doc.splitTextToSize(String(valeur),largeur);
      const pas=taille*0.3528*1.4;
      for(const ligne of lignes){if(y+pas>limite){doc.addPage();y=20;}doc.text(ligne,x,y);y+=pas;}
    };
    doc.setProperties({title:"Parcours robotique — "+cycle+" — "+ensemble,author:"Centre de services scolaire des Bois-Francs"});
    texte("Centre de services scolaire des Bois-Francs",10,false,[85,100,120]);y+=3;
    texte("Mon parcours robotique",22,true,[22,39,74]);y+=2;
    texte(cycle+" · "+ensemble,13,true);y+=3;
    texte(window.dureeTotaleParcours(projets),10,true);y+=4;
    texte("Une progression proposée à adapter au rythme de votre classe.",10);y+=7;
    projets.forEach((p,i)=>{
      x=p.imagePDF ? 70 : marge;largeur=192-x;
      doc.setFont("helvetica","bold");doc.setFontSize(13);
      const titre=doc.splitTextToSize((i+1)+". "+p.titre,largeur);
      doc.setFont("helvetica","normal");doc.setFontSize(11);
      const description=doc.splitTextToSize(p.description||"",largeur);
      const hauteur=Math.max(p.imagePDF ? 46 : 0,titre.length*6.5+description.length*5.5+34);
      if(y+hauteur>limite && hauteur<limite-20){doc.addPage();y=20;}
      const debut=y;
      if(p.imagePDF){const ratio=p.imagePDF.ratio;let w=44,h=w/ratio;if(h>40){h=40;w=h*ratio;}doc.addImage(p.imagePDF.data,"PNG",marge+(44-w)/2,y-4+(40-h)/2,w,h,undefined,"FAST");}
      texte((i+1)+". "+p.titre,13,true,[22,39,74]);
      if(p.sousTitre)texte(p.sousTitre,9,false,[85,100,120]);
      if(p.duree)texte(p.duree+" min",9,false,[85,100,120]);
      y+=2;texte(p.description||"",11);y+=3;
      const liens=[["Cahier de l’élève",p.documents?.eleve||p.lien],["Guide de l’enseignant",p.documents?.guide]].filter(([,url])=>{try{return new URL(url).protocol==="https:";}catch{return false;}});
      if(!liens.length)texte("Documents à venir",10,false,[85,100,120]);
      liens.forEach(([libelle,url])=>{
        if(y+6>limite){doc.addPage();y=20;}
        doc.setFontSize(10);doc.setTextColor(28,91,150);doc.textWithLink(libelle,x,y,{url});y+=6;
      });
      y=Math.max(y,debut+(p.imagePDF?40:0));x=marge;largeur=174;
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
    const avecImages=await Promise.all(projets.map(chargerImagePDF));
    const doc=window.creerPDFParcours(jsPDF,cycle,ensemble,avecImages);
    const nom=("parcours-"+cycle+"-"+ensemble).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g,"-").toLowerCase();
    doc.save(nom+".pdf");
  };
})();
