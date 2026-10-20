/**
 * Utilidad unificada de descarga para 4S Clima.
 * 
 * Implementa el mismo mecanismo de guardado de los PDFs:
 * 1. File System Access API (window.showSaveFilePicker):
 *    Abre la ventana nativa de "Guardar como..." de Windows/Chrome con el nombre
 *    y la extensión exactos, evitando que Chromium degrade la descarga a un UUID en memoria.
 * 2. Si el usuario cancela en la ventana nativa, no hace nada ni da error.
 * 3. Fallback tradicional por <a> tag con retardo de limpieza si el navegador no soporta showSaveFilePicker.
 */
export async function saveAndDownloadBlob(blob, fileName, fileTypes = []) {
  // SOLUCIÓN A: File System Access API (Nativo de Chrome / Edge / Opera)
  if (typeof window !== 'undefined' && window.showSaveFilePicker) {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: fileTypes.length > 0 ? fileTypes : [
          {
            description: 'Archivo de Excel (CSV)',
            accept: {
              'text/csv': ['.csv'],
            },
          },
        ],
      });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      console.log('[4S Clima Download] Archivo guardado con éxito:', fileName);
      return { fileName };
    } catch (cancelError) {
      if (cancelError.name === 'AbortError') {
        console.log('[4S Clima Download] Guardado cancelado por el usuario');
        return { canceled: true };
      }
      console.warn('[4S Clima Download] showSaveFilePicker falló, recurriendo a fallback tradicional:', cancelError);
    }
  }

  // SOLUCIÓN B: Fallback tradicional por elemento <a>
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    if (document.body.contains(link)) {
      document.body.removeChild(link);
    }
    URL.revokeObjectURL(url);
  }, 2000);

  return { fileName };
}
