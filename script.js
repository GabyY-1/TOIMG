(() => {
  const $ = id => document.getElementById(id);
  let files=[],previewUrl=null;
  $('drop').addEventListener('click',()=>$('file').click());
  $('drop').addEventListener('dragover',e=>{e.preventDefault();$('drop').classList.add('drag')});
  $('drop').addEventListener('dragleave',()=>$('drop').classList.remove('drag'));
  $('drop').addEventListener('drop',e=>{e.preventDefault();$('drop').classList.remove('drag');loadFiles(e.dataTransfer.files)});
  $('file').addEventListener('change',e=>loadFiles(e.target.files));
  function sanitize(text){
    const doc=new DOMParser().parseFromString(text,'image/svg+xml');
    if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')throw Error('SVG invalide');
    doc.querySelectorAll('script,foreignObject').forEach(el=>el.remove());
    doc.querySelectorAll('*').forEach(el=>[...el.attributes].forEach(a=>{
      if(/^on/i.test(a.name))el.removeAttribute(a.name);
      if((/href$/i.test(a.name)||/^(src|filter|fill|stroke)$/i.test(a.name))&&/^(https?:|javascript:)/i.test(a.value))el.removeAttribute(a.name);
    }));
    return new XMLSerializer().serializeToString(doc.documentElement);
  }
  async function loadFiles(input){
    const incoming=[...input];if(!incoming.length)return;
    files=[];let errors=0;
    for(const file of incoming){
      if((!/\.svg$/i.test(file.name)&&file.type!=='image/svg+xml')||file.size>20*1024*1024){errors++;continue;}
      try{files.push({name:file.name.replace(/\.svg$/i,''),text:sanitize(await file.text())});}catch(e){errors++;}
    }
    $('file-list').replaceChildren(...files.map(f=>{
      const li=document.createElement('li'),ic=document.createElement('i');
      ic.setAttribute('data-lucide','file-image');li.append(ic,document.createTextNode(f.name+'.svg'));return li;
    }));
    window.lucide?.createIcons();
    $('file-status').textContent=files.length+' SVG chargé(s)'+(errors?' • '+errors+' ignoré(s)':'');
    $('export').disabled=!files.length;
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    if(files.length){previewUrl=URL.createObjectURL(new Blob([files[0].text],{type:'image/svg+xml'}));const img=new Image();img.alt=files[0].name;img.src=previewUrl;$('preview').replaceChildren(img);}
    else $('preview').textContent='Aucun fichier valide';
    $('status').textContent='';
  }
  function svgDimensions(text){
    const doc=new DOMParser().parseFromString(text,'image/svg+xml');
    const svg=doc.documentElement;
    const parseLength=value=>{
      const raw=String(value||'').trim();
      if(!raw||raw.endsWith('%'))return 0;
      const match=raw.match(/^([0-9]*\.?[0-9]+)/);
      return match?Number(match[1]):0;
    };
    let width=parseLength(svg.getAttribute('width'));
    let height=parseLength(svg.getAttribute('height'));
    const viewBox=(svg.getAttribute('viewBox')||'').trim().split(/[ ,]+/).map(Number);
    if((!width||!height)&&viewBox.length===4&&viewBox.every(Number.isFinite)){
      if(!width)width=viewBox[2];
      if(!height)height=viewBox[3];
    }
    if(!width||!height)throw Error('Dimensions SVG introuvables');
    width=Math.round(width);height=Math.round(height);
    if(width<1||height<1||width>8192||height>8192)throw Error('Dimensions hors limites (1–8192 px)');
    return {width,height};
  }
  async function pngBlob(f,bg){
    const {width:w,height:h}=svgDimensions(f.text);
    const url=URL.createObjectURL(new Blob([f.text],{type:'image/svg+xml'}));
    try{
      const img=new Image();img.src=url;await img.decode();
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas indisponible');
      if(bg!=='transparent'){ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);}
      const iw=img.naturalWidth||w,ih=img.naturalHeight||h,scale=Math.min(w/iw,h/ih);
      ctx.drawImage(img,(w-iw*scale)/2,(h-ih*scale)/2,iw*scale,ih*scale);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw Error('Échec PNG');return blob;
    }finally{URL.revokeObjectURL(url);}
  }
  function saveBlob(blob,name){
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),15000);
  }
  $('export').addEventListener('click',async()=>{
    if(!files.length)return;
    if(!window.JSZip){$('status').textContent='Bibliothèque ZIP non chargée. Vérifiez votre connexion.';return;}
    $('export').disabled=true;const zip=new JSZip(),failed=[],names=new Set();
    for(let i=0;i<files.length;i++){
      const f=files[i];$('status').textContent='Conversion '+(i+1)+'/'+files.length+' : '+f.name;
      try{
        const blob=await pngBlob(f,$('background').value);
        let name=f.name+'.png',n=2;
        while(names.has(name)){name=f.name+'-'+(n++)+'.png';}
        names.add(name);zip.file(name,blob);
      }catch(e){failed.push(f.name);}
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(!names.size){$('status').textContent='Échec : aucun PNG généré.';$('export').disabled=false;return;}
    $('status').textContent='Création du ZIP…';
    try{const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
      saveBlob(blob,'TOIMG-'+names.size+'-images.zip');
      $('status').textContent=names.size+' PNG dans le ZIP'+(failed.length?' • '+failed.length+' échec(s) : '+failed.join(', '):'')+'.';
    }catch(e){$('status').textContent='Impossible de créer le ZIP : '+e.message;}
    finally{$('export').disabled=false;}
  });
  window.addEventListener("load",()=>window.lucide?.createIcons());
})();
