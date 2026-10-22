(() => {
  const $ = id => document.getElementById(id);
  let files = [];
  let previewUrl = null;
  let automationFiles = [];

  document.querySelectorAll('[data-tab]').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach(tab => {
        const selected = tab === button;
        tab.setAttribute('aria-selected', String(selected));
        $(tab.dataset.tab).classList.toggle('hidden', !selected);
      });
    });
  });

  $('drop').addEventListener('click', () => $('file').click());
  $('drop').addEventListener('dragover', event => {
    event.preventDefault();
    $('drop').classList.add('drag');
  });
  $('drop').addEventListener('dragleave', () => $('drop').classList.remove('drag'));
  $('drop').addEventListener('drop', event => {
    event.preventDefault();
    $('drop').classList.remove('drag');
    loadFiles(event.dataTransfer.files);
  });
  $('file').addEventListener('change', event => loadFiles(event.target.files));

  function sanitize(text) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') {
      throw Error('SVG invalide');
    }
    doc.querySelectorAll('script,foreignObject').forEach(el => el.remove());
    doc.querySelectorAll('*').forEach(el => [...el.attributes].forEach(attribute => {
      if (/^on/i.test(attribute.name)) el.removeAttribute(attribute.name);
      if ((/href$/i.test(attribute.name) || /^(src|filter|fill|stroke)$/i.test(attribute.name)) &&
          /^(https?:|javascript:)/i.test(attribute.value)) {
        el.removeAttribute(attribute.name);
      }
    }));
    return new XMLSerializer().serializeToString(doc.documentElement);
  }

  async function loadFiles(input) {
    const incoming = [...input];
    if (!incoming.length) return;
    files = [];
    let errors = 0;

    for (const file of incoming) {
      if ((!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') || file.size > 20 * 1024 * 1024) {
        errors++;
        continue;
      }
      try {
        files.push({ name: file.name.replace(/\.svg$/i, ''), text: sanitize(await file.text()) });
      } catch {
        errors++;
      }
    }

    $('file-list').replaceChildren(...files.slice(0, 100).map(file => {
      const item = document.createElement('li');
      const icon = document.createElement('i');
      icon.setAttribute('data-lucide', 'file-image');
      item.append(icon, document.createTextNode(file.name + '.svg'));
      return item;
    }));
    if (files.length > 100) {
      const item = document.createElement('li');
      item.textContent = '… et ' + (files.length - 100) + ' autre(s)';
      $('file-list').append(item);
    }
    window.lucide?.createIcons();
    $('file-status').textContent = files.length + ' SVG chargé(s)' + (errors ? ' • ' + errors + ' ignoré(s)' : '');
    $('export').disabled = !files.length;

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (files.length) {
      previewUrl = URL.createObjectURL(new Blob([files[0].text], { type: 'image/svg+xml' }));
      const image = new Image();
      image.alt = files[0].name;
      image.src = previewUrl;
      $('preview').replaceChildren(image);
    } else {
      $('preview').textContent = 'Aucun fichier valide';
    }
    $('status').textContent = '';
  }

  function svgDimensions(text) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = doc.documentElement;
    const parseLength = value => {
      const raw = String(value || '').trim();
      if (!raw || raw.endsWith('%')) return 0;
      const match = raw.match(/^([0-9]*\.?[0-9]+)/);
      return match ? Number(match[1]) : 0;
    };
    let width = parseLength(svg.getAttribute('width'));
    let height = parseLength(svg.getAttribute('height'));
    const viewBox = (svg.getAttribute('viewBox') || '').trim().split(/[ ,]+/).map(Number);
    if ((!width || !height) && viewBox.length === 4 && viewBox.every(Number.isFinite)) {
      if (!width) width = viewBox[2];
      if (!height) height = viewBox[3];
    }
    if (!width || !height) throw Error('Dimensions SVG introuvables');
    width = Math.round(width);
    height = Math.round(height);
    if (width < 1 || height < 1 || width > 8192 || height > 8192) {
      throw Error('Dimensions hors limites (1–8192 px)');
    }
    return { width, height };
  }

  async function pngBlob(file, background) {
    const { width, height } = svgDimensions(file.text);
    const url = URL.createObjectURL(new Blob([file.text], { type: 'image/svg+xml' }));
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw Error('Canvas indisponible');
      if (background !== 'transparent') {
        context.fillStyle = background;
        context.fillRect(0, 0, width, height);
      }
      const imageWidth = image.naturalWidth || width;
      const imageHeight = image.naturalHeight || height;
      const scale = Math.min(width / imageWidth, height / imageHeight);
      context.drawImage(image, (width - imageWidth * scale) / 2, (height - imageHeight * scale) / 2,
        imageWidth * scale, imageHeight * scale);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw Error('Échec PNG');
      return blob;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  $('export').addEventListener('click', async () => {
    if (!files.length) return;
    if (!window.JSZip) {
      $('status').textContent = 'Bibliothèque ZIP non chargée. Vérifiez votre connexion.';
      return;
    }
    $('export').disabled = true;
    const zip = new JSZip();
    const failed = [];
    const names = new Set();

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      $('status').textContent = 'Conversion ' + (index + 1) + '/' + files.length + ' : ' + file.name;
      try {
        const blob = await pngBlob(file, $('background').value);
        let name = file.name + '.png';
        let number = 2;
        while (names.has(name)) name = file.name + '-' + number++ + '.png';
        names.add(name);
        zip.file(name, blob);
      } catch {
        failed.push(file.name);
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    if (!names.size) {
      $('status').textContent = 'Échec : aucun PNG généré.';
      $('export').disabled = false;
      return;
    }
    $('status').textContent = 'Création du ZIP…';
    try {
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      saveBlob(blob, 'TOIMG-' + names.size + '-images.zip');
      $('status').textContent = names.size + ' PNG dans le ZIP' +
        (failed.length ? ' • ' + failed.length + ' échec(s) : ' + failed.join(', ') : '') + '.';
    } catch (error) {
      $('status').textContent = 'Impossible de créer le ZIP : ' + error.message;
    } finally {
      $('export').disabled = false;
    }
  });

  $('automation-action').addEventListener('change', updateAutomationDescription);
  $('choose-folder').addEventListener('click', () => $('folder-input').click());
  $('automation-drop').addEventListener('click', event => {
    if (event.target.closest('button')) return;
    $('folder-input').click();
  });
  $('folder-input').addEventListener('change', event => setAutomationFiles(event.target.files));

  function updateAutomationDescription() {
    $('automation-description').textContent = $('automation-action').value === 'remove-json'
      ? 'Les fichiers .json seront exclus du ZIP. Tous les autres fichiers et dossiers seront conservés.'
      : 'Seuls les fichiers .svg seront inclus dans le ZIP. Les autres types de fichiers seront exclus.';
    updateAutomationCounts();
  }

  function relativePath(file) {
    const path = file.webkitRelativePath || file.name;
    const parts = path.split('/');
    return parts.length > 1 ? parts.slice(1).join('/') : path;
  }

  function setAutomationFiles(input) {
    automationFiles = [...input];
    const folderName = automationFiles[0]?.webkitRelativePath?.split('/')[0] || 'dossier sélectionné';
    $('automation-file-status').textContent = automationFiles.length
      ? folderName + ' · ' + automationFiles.length.toLocaleString('fr-FR') + ' fichier(s) détecté(s).'
      : 'Aucun dossier sélectionné.';
    $('automation-summary').classList.toggle('hidden', !automationFiles.length);
    $('automation-run').disabled = !automationFiles.length;
    $('automation-progress-wrap').classList.add('hidden');
    updateAutomationCounts();
  }

  function updateAutomationCounts() {
    const action = $('automation-action').value;
    const included = automationFiles.filter(file => action === 'remove-json'
      ? !file.name.toLowerCase().endsWith('.json')
      : file.name.toLowerCase().endsWith('.svg'));
    $('automation-total').textContent = automationFiles.length.toLocaleString('fr-FR');
    $('automation-included').textContent = included.length.toLocaleString('fr-FR');
    $('automation-excluded').textContent = (automationFiles.length - included.length).toLocaleString('fr-FR');
  }

  $('automation-run').addEventListener('click', async () => {
    if (!automationFiles.length) return;
    if (!window.JSZip) {
      $('automation-status').textContent = 'La bibliothèque ZIP ne s’est pas chargée. Vérifiez votre connexion puis rechargez la page.';
      $('automation-progress-wrap').classList.remove('hidden');
      return;
    }

    const action = $('automation-action').value;
    const selected = automationFiles.filter(file => action === 'remove-json'
      ? !file.name.toLowerCase().endsWith('.json')
      : file.name.toLowerCase().endsWith('.svg'));
    if (!selected.length) {
      $('automation-status').textContent = 'Aucun fichier ne correspond à cette opération.';
      $('automation-progress-wrap').classList.remove('hidden');
      return;
    }

    $('automation-run').disabled = true;
    $('choose-folder').disabled = true;
    $('automation-progress-wrap').classList.remove('hidden');
    $('automation-progress').style.width = '0%';
    const zip = new JSZip();
    let added = 0;
    let errors = 0;

    try {
      for (let index = 0; index < selected.length; index++) {
        const file = selected[index];
        $('automation-status').textContent = 'Préparation ' + (index + 1).toLocaleString('fr-FR') +
          ' / ' + selected.length.toLocaleString('fr-FR') + ' · ' + file.name;
        try {
          zip.file(relativePath(file), file);
          added++;
        } catch {
          errors++;
        }
        if (index % 20 === 0) {
          $('automation-progress').style.width = Math.round((index + 1) / selected.length * 70) + '%';
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      if (!added) throw Error('Aucun fichier n’a pu être ajouté au ZIP.');
      $('automation-status').textContent = 'Création de l’archive ZIP…';
      const blob = await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 } },
        metadata => {
          $('automation-progress').style.width = (70 + Math.round(metadata.percent * 0.3)) + '%';
          $('automation-status').textContent = 'Création du ZIP… ' + Math.round(metadata.percent) + '%';
        }
      );
      const label = action === 'remove-json' ? 'sans-json' : 'svg-seulement';
      saveBlob(blob, 'TOIMG-automatisation-' + label + '.zip');
      $('automation-progress').style.width = '100%';
      $('automation-status').textContent = 'Terminé : ' + added.toLocaleString('fr-FR') +
        ' fichier(s) dans le ZIP' + (errors ? ' · ' + errors + ' erreur(s)' : '') + '.';
    } catch (error) {
      $('automation-status').textContent = 'Erreur : ' + error.message;
    } finally {
      $('automation-run').disabled = false;
      $('choose-folder').disabled = false;
    }
  });

  window.addEventListener('load', () => window.lucide?.createIcons());
})();
