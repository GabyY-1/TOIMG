(() => {
  const $ = id => document.getElementById(id);
  let files=[],previewUrl=null;
  document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(b=>b.setAttribute('aria-selected',String(b===btn)));
    ['png','anim'].forEach(id=>$(id).classList.toggle('hidden',id!==btn.dataset.tab));
  }));
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
  let animFiles=[],abortRecording=false,activeRecorder=null,activeStream=null;
  $('anim-drop').addEventListener('click',()=>$('anim-file').click());
  $('anim-file').addEventListener('change',e=>loadAnimations(e.target.files));
  $('anim-drop').addEventListener('dragover',e=>{e.preventDefault();$('anim-drop').classList.add('drag')});
  $('anim-drop').addEventListener('dragleave',()=>$('anim-drop').classList.remove('drag'));
  $('anim-drop').addEventListener('drop',e=>{e.preventDefault();$('anim-drop').classList.remove('drag');loadAnimations(e.dataTransfer.files)});
  async function loadAnimations(inputs){
    animFiles=[];let invalid=0;
    for(const f of inputs){
      try{
        if(!/\.svg$/i.test(f.name)&&f.type!=='image/svg+xml')throw Error('Format non SVG');
        if(f.size>20*1024*1024)throw Error('Trop volumineux');
        animFiles.push({name:f.name.replace(/\.svg$/i,''),text:sanitize(await f.text())});
      }catch(e){invalid++;}
    }
    $('anim-file-list').replaceChildren(...animFiles.map(f=>{
      const li=document.createElement('li'),ic=document.createElement('i');ic.setAttribute('data-lucide','file-image');
      li.append(ic,document.createTextNode(f.name+'.svg'));return li;
    }));
    window.lucide?.createIcons();
    $('anim-file-status').textContent=animFiles.length+' SVG importé(s)'+(invalid?' • '+invalid+' ignoré(s)':'');
    $('record').disabled=!animFiles.length;
  }
  function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
  const computedProperties=['opacity','visibility','display','fill','fill-opacity','fill-rule','stroke','stroke-width','stroke-opacity','stroke-linecap','stroke-linejoin','stroke-dasharray','stroke-dashoffset','transform','transform-origin','transform-box','filter','color','font-family','font-size','font-weight','letter-spacing','paint-order','clip-path'];
  function snapshotSVG(original){
    const clone=original.cloneNode(true);
    const src=[original,...original.querySelectorAll('*')],dst=[clone,...clone.querySelectorAll('*')];
    for(let i=0;i<src.length;i++){
      const style=getComputedStyle(src[i]);
      for(const prop of computedProperties){
        const value=style.getPropertyValue(prop);
        if(value)dst[i].style.setProperty(prop,value);
      }
      dst[i].style.setProperty('animation','none','important');
      dst[i].style.setProperty('transition','none','important');
    }
    clone.querySelectorAll('style,animate,animateTransform,animateMotion,set,script,foreignObject').forEach(el=>el.remove());
    return new XMLSerializer().serializeToString(clone);
  }
  async function paintFrame(original,ctx,w,h){
    const blob=new Blob([snapshotSVG(original)],{type:'image/svg+xml'});
    const url=URL.createObjectURL(blob);
    try{
      const image=new Image();image.src=url;await image.decode();
      ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
      const iw=image.naturalWidth||w,ih=image.naturalHeight||h,scale=Math.min(w/iw,h/ih);
      ctx.drawImage(image,(w-iw*scale)/2,(h-ih*scale)/2,iw*scale,ih*scale);
    }finally{URL.revokeObjectURL(url);}
  }
  $('stop').addEventListener('click',()=>{
    abortRecording=true;
    if(activeRecorder&&activeRecorder.state==='recording')activeRecorder.stop();
    if(activeStream)activeStream.getTracks().forEach(t=>t.stop());
    $('record-status').textContent='Arrêt demandé.';
  });
  $('record').addEventListener('click',async()=>{
    if(!animFiles.length)return;
    const seconds=Number($('seconds').value),fps=Number($('fps').value);
    if(!Number.isFinite(seconds)||seconds<1||seconds>60){
      $('record-status').textContent='Paramètres de durée ou de dimensions invalides.';return;
    }
    if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){$('record-status').textContent='L’enregistrement vidéo n’est pas disponible dans ce navigateur.';return;}
    const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime){$('record-status').textContent='Aucun encodeur vidéo compatible.';return;}
    abortRecording=false;$('record').disabled=true;$('stop').disabled=false;
    const zip=new JSZip(),failed=[];
    for(let i=0;i<animFiles.length&&!abortRecording;i++){
      const file=animFiles[i],stage=$('svg-stage');
      try{
        $('record-status').textContent='Vidéo '+(i+1)+'/'+animFiles.length+' : '+file.name;
        const {width:w,height:h}=svgDimensions(file.text);
        if(w>3840||h>2160)throw Error('Dimensions vidéo hors limites (3840 × 2160 px)');
        stage.style.width=w+'px';stage.style.height=h+'px';stage.replaceChildren();
        const doc=new DOMParser().parseFromString(file.text,'image/svg+xml');
        const svg=document.importNode(doc.documentElement,true);
        stage.appendChild(svg);
        const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
        const ctx=canvas.getContext('2d',{alpha:false});
        const stream=canvas.captureStream(0),track=stream.getVideoTracks()[0];
        activeStream=stream;
        const chunks=[],rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4000000});
        activeRecorder=rec;
        rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
        const complete=new Promise((resolve,reject)=>{rec.onstop=resolve;rec.onerror=e=>reject(e.error||Error('Encodeur vidéo'));});
        rec.start(250);
        const start=performance.now();let nextFrame=0;
        while(!abortRecording&&(performance.now()-start)/1000<seconds){
          if(performance.now()>=nextFrame){
            await paintFrame(svg,ctx,w,h);
            track.requestFrame?.();
            nextFrame=performance.now()+1000/fps;
          }
          await delay(5);
        }
        if(rec.state!=='inactive')rec.stop();await complete;
        stream.getTracks().forEach(t=>t.stop());activeRecorder=null;activeStream=null;
        if(chunks.length&&!abortRecording){
          zip.file(file.name+'.webm',new Blob(chunks,{type:mime}));
        }
      }catch(e){failed.push(file.name+' : '+e.message);}
      finally{stage.replaceChildren();}
    }
    if(!abortRecording){
      const filesCount=Object.keys(zip.files).length;
      if(filesCount){
        $('record-status').textContent='Préparation du téléchargement…';
        const blob=await zip.generateAsync({type:'blob'});
        saveBlob(blob,'TOIMG-animations.zip');
        $('record-status').textContent=filesCount+' vidéo(s) exportée(s) en WebM'+(failed.length?' • '+failed.length+' échec(s)':'')+'.';
      }else $('record-status').textContent='Aucune vidéo générée. '+failed.join(' | ');
    }
    $('record').disabled=false;$('stop').disabled=true;
  });
  window.addEventListener("load",()=>window.lucide?.createIcons());
})();
