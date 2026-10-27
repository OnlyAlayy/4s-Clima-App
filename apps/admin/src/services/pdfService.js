import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate } from '@4s-clima/shared/utils';
import { EQUIPMENT_TYPE_LABELS, WORK_ORDER_TYPE_LABELS } from '@4s-clima/shared/constants';
import QRCode from 'qrcode';

/**
 * Función para obtener una imagen de una URL y convertirla a base64 (necesario para jsPDF)
 */
const getLogoForPDF = async (imageUrl) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.filter = 'brightness(0) invert(1)';
        ctx.drawImage(img, 0, 0);
        
        resolve({
          dataUrl: canvas.toDataURL('image/jpeg', 0.95),
          ratio: img.width / img.height
        });
      } catch (e) {
        console.error("CORS Error in logo canvas:", e);
        resolve(null); // Fallback so PDF generation doesn't hang
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
};

const getBase64ImageFromUrl = async (imageUrl) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!imageUrl.startsWith('data:')) {
      img.crossOrigin = 'Anonymous';
    }
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          ratio: img.width / img.height
        });
      } catch (e) {
        console.error("CORS Error in signature/photo canvas:", e);
        resolve(null); // Prevents hanging if tainted canvas
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
};
/**
 * Prepara el PDF y retorna { url, fileName, file, blob }.
 * Configura los metadatos en jsPDF para que los visores de Chrome y Firefox
 * utilicen el nombre real del archivo al visualizarlo o guardarlo.
 * Utiliza un objeto File en lugar de un Blob genérico para que Chrome asocie
 * el nombre real en su registro interno de memoria y evite nombres UUID temporales.
 */
const savePDF = (doc, fileName) => {
  const cleanFileName = (fileName || 'documento.pdf')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
  const validFileName = cleanFileName.endsWith('.pdf') ? cleanFileName : `${cleanFileName}.pdf`;

  // Asignar metadatos al PDF para que los visores muestren el nombre real
  doc.setProperties({
    title: validFileName,
    subject: validFileName,
    author: '4S Clima S.A.'
  });

  return { doc, fileName: validFileName };
};

/**
 * Guarda y descarga el PDF controlando manualmente el Blob para evitar 
 * que Chromium omita el nombre del archivo y lo guarde como un UUID.
 */
export const openAndDownloadPDF = async (generatePromise, preOpenedTab) => {
  try {
    if (preOpenedTab && !preOpenedTab.closed) {
      preOpenedTab.close();
    }
    console.log('[4S Clima PDF] Generando documento PDF...');
    const { doc, fileName } = await generatePromise;
    console.log('[4S Clima PDF] Guardando directamente a disco:', fileName);
    
    // 1. Extraemos el PDF como un archivo binario en memoria (Blob)
    const pdfBlob = doc.output('blob');

    // SOLUCIÓN A: File System Access API (Chrome, Edge, Opera)
    // Abre la ventana nativa de "Guardar como..." garantizando el nombre y extensión.
    if (window.showSaveFilePicker) {
      try {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'Documento PDF',
            accept: { 'application/pdf': ['.pdf'] },
          }],
        });
        const writable = await fileHandle.createWritable();
        await writable.write(pdfBlob);
        await writable.close();
        return { fileName };
      } catch (cancelError) {
        // Si el usuario cancela la ventana, simplemente salimos sin error
        console.log('[4S Clima PDF] Guardado cancelado por el usuario');
        return;
      }
    }

    // SOLUCIÓN B: Fallback tradicional (Firefox, Safari o si falla la API anterior)
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName; // Aquí aseguramos el nombre
    document.body.appendChild(link);
    link.click(); // Disparamos la descarga
    
    // CRÍTICO: Esperamos 2 segundos antes de borrar el enlace y la memoria.
    // Esto evita la condición de carrera y le da tiempo al gestor de Chrome de leer el nombre.
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 2000);

    return { fileName };

  } catch (err) {
    if (preOpenedTab && !preOpenedTab.closed) {
      preOpenedTab.close();
    }
    console.error('[4S Clima PDF] Error en generación/descarga:', err);
    throw err;
  }
};

export const generateWorkOrderPDF = async (wo) => {
  // Configuración inicial del PDF (A4 vertical)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let currentY = 15; // Cursor Y actual

  // ==========================================
  // HEADER (Logo y Título)
  // ==========================================
  // Intentamos agregar un rectángulo para el header corporativo
  doc.setFillColor(30, 41, 59); // color surface-dark
  doc.rect(0, 0, pageWidth, 25, 'F');
  
  // Intentamos agregar el logo si existe
  try {
    const logoData = await getLogoForPDF('/logopngremito.png');
    if (logoData && logoData.dataUrl) {
      const targetHeight = 12;
      const targetWidth = targetHeight * logoData.ratio;
      doc.addImage(logoData.dataUrl, 'JPEG', 15, 6, targetWidth, targetHeight);
    } else {
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("4S CLIMA", 15, 17);
    }
  } catch (err) {
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("4S CLIMA", 15, 17);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`REMITO DE SERVICIO #${wo.order_number || wo.id.slice(0,8)}`, pageWidth - 15, 17, { align: "right" });

  currentY = 35;
  doc.setTextColor(50, 50, 50);

  // ==========================================
  // DATOS GENERALES
  // ==========================================
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("DATOS DEL SERVICIO", 15, currentY);
  currentY += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  
  const clientName = wo.client?.name || 'N/D';
  const plantName = wo.plant?.name || 'N/D';
  const plantAddress = wo.plant?.address || '';
  const dateStr = formatDate(wo.scheduled_date);
  const techName = wo.assigned?.name || 'N/D';
  const woType = WORK_ORDER_TYPE_LABELS[wo.type] || wo.type;

  const leftCol = [
    `Cliente: ${clientName}`,
    `Planta: ${plantName} ${plantAddress ? `(${plantAddress})` : ''}`,
    `Tipo de Trabajo: ${woType}`
  ];

  const rightCol = [
    `Fecha Programada: ${dateStr}`,
    `Técnico Asignado: ${techName}`,
    `Estado: Completado`
  ];

  leftCol.forEach((text, i) => {
    doc.text(text, 15, currentY + (i * 6));
  });

  rightCol.forEach((text, i) => {
    doc.text(text, pageWidth / 2 + 10, currentY + (i * 6));
  });

  currentY += 22;

  // ==========================================
  // DATOS DEL EQUIPO
  // ==========================================
  if (wo.equipment) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("EQUIPO INTERVENIDO", 15, currentY);
    currentY += 8;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    const eqType = EQUIPMENT_TYPE_LABELS[wo.equipment.type] || wo.equipment.type;
    const eq = [
      `Tipo: ${eqType}`,
      `Marca / Modelo: ${wo.equipment.brand} ${wo.equipment.model}`,
      `N° Serie: ${wo.equipment.serial_number || 'N/D'}`,
      `Ubicación: ${wo.equipment.location_description || 'N/D'}`
    ];

    eq.forEach((text, i) => {
      doc.text(text, 15, currentY + (i * 6));
    });
    
    currentY += 28;
  }

  // ==========================================
  // CHECKLIST REALIZADO
  // ==========================================
  if (wo.checklist_items && wo.checklist_items.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("TAREAS REALIZADAS (CHECKLIST)", 15, currentY);
    currentY += 4;

    const sortedItems = [...wo.checklist_items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const checklistData = sortedItems.map(item => {
      let statusStr = "N/A";
      if (item.status === 'ok') statusStr = 'OK';
      else if (item.status === 'warning') statusStr = 'Observación';
      else if (item.status === 'fail') statusStr = 'Falla';
      return [item.item_name, statusStr, item.notes || '-'];
    });

    autoTable(doc, {
      startY: currentY,
      head: [['Tarea / Inspección', 'Estado', 'Observación / Acción']],
      body: checklistData,
      theme: 'grid',
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 25 },
        2: { cellWidth: 'auto' }
      }
    });

    currentY = doc.lastAutoTable.finalY + 15;
  }

  // Comprobar salto de página antes de fotos o firma
  if (currentY > 230) {
    doc.addPage();
    currentY = 20;
  }

  // ==========================================
  // EVIDENCIA FOTOGRÁFICA
  // ==========================================
  if (wo.photos && wo.photos.length > 0) {
    const isSurvey = Boolean(
      wo.is_survey_only ||
      wo.type === 'survey' ||
      wo.type === 'diagnostic' ||
      wo.type === 'technical_visit' ||
      wo.type === 'relevamiento' ||
      wo.type === 'evaluacion'
    );

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(isSurvey ? "EVIDENCIA FOTOGRÁFICA / RELEVAMIENTO" : "EVIDENCIA FOTOGRÁFICA", 15, currentY);
    currentY += 8;

    // Obtener las imágenes en base64 para incluirlas en el PDF
    const photoWidth = 55;
    const photoHeight = 38;
    let photoX = 15;

    // Desduplicar fotos únicamente si tienen la misma URL (conservando 1 a N fotos)
    const uniquePhotos = [];
    const seenUrls = new Set();
    for (const p of wo.photos) {
      const url = p.url || p.photo_url;
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        uniquePhotos.push(p);
      }
    }

    for (const photo of uniquePhotos) {
      if (photoX + photoWidth > pageWidth - 15) {
        photoX = 15;
        currentY += photoHeight + 14;
        if (currentY > 235) {
          doc.addPage();
          currentY = 20;
        }
      }

      try {
        const photoUrl = photo.url || photo.photo_url;
        const base64Img = await getBase64ImageFromUrl(photoUrl);
        if (base64Img && base64Img.dataUrl) {
          // Ajustar height usando el ratio para no estirar la foto
          let finalWidth = photoWidth;
          let finalHeight = photoWidth / base64Img.ratio;
          
          if (finalHeight > photoHeight) {
            finalHeight = photoHeight;
            finalWidth = finalHeight * base64Img.ratio;
          }
          
          // Centrar la imagen en su caja asignada
          const offsetX = photoX + (photoWidth - finalWidth) / 2;
          const offsetY = currentY + (photoHeight - finalHeight) / 2;

          doc.addImage(base64Img.dataUrl, 'JPEG', offsetX, offsetY, finalWidth, finalHeight);
          
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          let pLabel = "Foto";
          if (photo.type === 'before') {
            pLabel = isSurvey ? "Relevamiento inicial" : "Antes del servicio";
          } else if (photo.type === 'after') {
            pLabel = "Después del servicio";
          } else if (photo.type === 'issue') {
            pLabel = "Incidencia / Detalle";
          }
          
          doc.text(pLabel, photoX + (photoWidth / 2), currentY + photoHeight + 4, { align: 'center' });

          const caption = photo.caption || photo.notes;
          if (caption) {
            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");
            const captionTruncated = caption.length > 28 ? caption.substring(0, 26) + '...' : caption;
            doc.text(captionTruncated, photoX + (photoWidth / 2), currentY + photoHeight + 8, { align: 'center' });
          }

          photoX += photoWidth + 5;
        }
      } catch (e) {
        console.error("No se pudo cargar la foto para el PDF", e);
      }
    }
    currentY += photoHeight + 15;
  }

  // Comprobar salto de página antes de firma
  if (currentY > 240) {
    doc.addPage();
    currentY = 20;
  }

  // ==========================================
  // FIRMA DEL CLIENTE
  // ==========================================
  if (wo.signatures && wo.signatures.length > 0) {
    const signature = wo.signatures[0]; // Tomamos la última o única
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("CONFORMIDAD DEL CLIENTE", 15, currentY);
    currentY += 8;

    try {
      const sigBase64 = await getBase64ImageFromUrl(signature.signature_url);
      if (sigBase64 && sigBase64.dataUrl) {
        // Ajustar el tamaño según el ratio para no deformar la firma
        let sigWidth = 60;
        let sigHeight = sigWidth / sigBase64.ratio;
        if (sigHeight > 30) {
          sigHeight = 30;
          sigWidth = sigHeight * sigBase64.ratio;
        }
        
        doc.addImage(sigBase64.dataUrl, 'PNG', 15, currentY, sigWidth, sigHeight);
      }
    } catch (e) {
      console.error("No se pudo cargar la firma para el PDF", e);
    }
    
    currentY += 35;
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Firma: ${signature.signer_name}`, 15, currentY);
    doc.text(`Cargo: ${signature.signer_role || '-'}`, 15, currentY + 5);
    doc.text(`Fecha: ${formatDate(signature.signed_at)}`, 15, currentY + 10);
  }

  // ==========================================
  // FOOTER
  // ==========================================
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Generado por 4S Clima ERP - Página ${i} de ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
  }

  // Preparar para descarga
  const fileName = `Remito_${wo.order_number || wo.id.slice(0,5)}_${clientName.replace(/\s+/g, '_')}.pdf`;
  return savePDF(doc, fileName);
};

/**
 * Genera el PDF de la Factura C (estilo AFIP)
 */
export const generateInvoicePDF = async (wo) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header AFIP - Factura C
  doc.setLineWidth(0.4);
  doc.rect(10, 10, pageWidth - 20, 45); // Cuadro principal
  doc.line(pageWidth / 2, 10, pageWidth / 2, 55); // Linea divisoria central

  // Letra C en el medio
  doc.setFillColor(255, 255, 255); // Fondo blanco para tapar la línea central
  doc.rect((pageWidth / 2) - 8, 10, 16, 16, 'FD'); // FD = Fill and Draw
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('C', pageWidth / 2, 21, { align: 'center' });
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  const docCode = wo.is_credit_note ? 'COD. 013' : 'COD. 011';
  doc.text(docCode, pageWidth / 2, 31, { align: 'center' });

  // Datos Empresa (Izquierda)
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('4S CLIMA', 15, 22);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Razón Social: 4S CLIMA S.A.', 15, 30);
  doc.text('Domicilio Comercial: CABA', 15, 35);
  doc.text('Condición frente al IVA: Monotributista', 15, 40);

  // Datos Factura (Derecha)
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  const docTitle = wo.is_credit_note ? 'NOTA DE CRÉDITO' : 'FACTURA';
  doc.text(docTitle, pageWidth / 2 + 10, 22);
  doc.setFontSize(10);
  doc.text(`Punto de Venta: 0001    Comp. Nro: ${wo.afip_voucher_number ? String(wo.afip_voucher_number).padStart(8, '0') : '00000000'}`, pageWidth / 2 + 10, 30);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha de Emisión: ${formatDate(wo.completed_at || new Date())}`, pageWidth / 2 + 10, 36);
  doc.text('CUIT: 23477380719', pageWidth / 2 + 10, 41);
  doc.text('Ingresos Brutos: 23477380719', pageWidth / 2 + 10, 46);
  doc.text('Inicio de Actividades: 01/01/2023', pageWidth / 2 + 10, 51);

  // Datos del Cliente
  doc.rect(10, 58, pageWidth - 20, 25);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('CUIT / DNI:', 15, 66);
  doc.setFont('helvetica', 'normal');
  doc.text(wo.client?.cuit || 'Consumidor Final', 45, 66);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Condición frente al IVA:', 110, 66);
  doc.setFont('helvetica', 'normal');
  
  // Condición IVA dinámica: Responsable Inscripto si tiene CUIT de empresa / comercial
  const cleanCuit = (wo.client?.cuit || '').replace(/\D/g, '');
  let ivaCondition = 'Consumidor Final';
  if (cleanCuit.length === 11) {
    ivaCondition = 'IVA Responsable Inscripto';
  }
  doc.text(ivaCondition, 155, 66);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Razón Social:', 15, 73);
  doc.setFont('helvetica', 'normal');
  doc.text(wo.client?.name || 'Consumidor Final', 45, 73);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Domicilio:', 15, 80);
  doc.setFont('helvetica', 'normal');
  const clientAddress = wo.client?.address || wo.plant?.address || 'Sin especificar';
  doc.text(clientAddress, 45, 80);

  // Detalles de la Orden / Factura (Desglose de repuestos y servicio técnico)
  const extras = Array.isArray(wo.extras) ? wo.extras : [];
  
  // Calcular la suma de repuestos
  const extrasSum = extras.reduce((sum, e) => {
    const qty = Number(e.quantity) || 1;
    const price = Number(e.unit_price) || 0;
    return sum + (qty * price);
  }, 0);

  const totalAmount = Number(wo.total_amount) || 0;
  // La mano de obra / servicio base es la diferencia entre el total y los repuestos (o el total si no hay repuestos)
  const baseLaborAmount = Math.max(0, totalAmount - extrasSum);

  const tableBody = [];

  // Renglón 1: Servicio técnico / Mano de obra (si tiene valor o si no hay repuestos)
  if (baseLaborAmount > 0 || extras.length === 0) {
    const serviceType = WORK_ORDER_TYPE_LABELS[wo.type] || wo.type || 'Mantenimiento Climatización';
    const orderRef = wo.order_number ? ` (OT ${wo.order_number})` : '';
    tableBody.push([
      '001',
      `Servicio Técnico: ${serviceType}${orderRef}`,
      '1',
      `$${baseLaborAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `$${baseLaborAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    ]);
  }

  // Renglones de Repuestos reportados por el técnico
  extras.forEach((extra) => {
    const itemCode = String(tableBody.length + 1).padStart(3, '0');
    const qty = Number(extra.quantity) || 1;
    const unitPrice = Number(extra.unit_price) || 0;
    const subtotal = qty * unitPrice;
    const unitBadge = extra.unit ? ` [${extra.unit}]` : '';
    const desc = `Repuesto: ${extra.description || 'Material / Repuesto'}${unitBadge}`;

    tableBody.push([
      itemCode,
      desc,
      String(qty),
      `$${unitPrice.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `$${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    ]);
  });

  autoTable(doc, {
    startY: 88,
    head: [['Código', 'Descripción', 'Cantidad', 'Precio Unitario', 'Subtotal']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 35, halign: 'right' },
      4: { cellWidth: 35, halign: 'right' },
    }
  });

  // Total
  const finalY = doc.lastAutoTable.finalY + 15;
  
  doc.setFillColor(240, 240, 240);
  doc.rect(pageWidth - 85, finalY - 8, 75, 12, 'F');
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`Importe Total: $${(wo.total_amount || 0).toLocaleString('es-AR')}`, pageWidth - 15, finalY, { align: 'right' });

  // Pie de Página - Código QR y CAE
  if (wo.afip_cae) {
    const emissionDate = wo.completed_at ? new Date(wo.completed_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const qrObj = { 
      ver: 1, 
      fecha: emissionDate, 
      cuit: 23477380719, 
      ptoVta: 1, 
      tipoCmp: wo.is_credit_note ? 13 : 11, 
      nroCmp: wo.afip_voucher_number, 
      importe: wo.total_amount 
    };
    const qrData = "https://www.afip.gob.ar/fe/qr/?p=" + btoa(JSON.stringify(qrObj));
    
    try {
      const qrDataUrl = await QRCode.toDataURL(qrData, { margin: 1 });
      doc.addImage(qrDataUrl, 'PNG', 15, 250, 30, 30);
    } catch (e) {
      console.error('Error al generar QR', e);
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`CAE: ${wo.afip_cae}`, pageWidth - 60, 260);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Vencimiento CAE: 31/12/2026', pageWidth - 60, 265);
  }

  const docPrefix = wo.is_credit_note ? 'NotaCredito' : 'Factura';
  const voucherNum = String(wo.afip_voucher_number || '00000001').padStart(8, '0');
  const fileName = `${docPrefix}_C_${voucherNum}.pdf`;
  return savePDF(doc, fileName);
};

/**
 * Genera el PDF del Recibo Oficial de Cobranza (Recibo X)
 */
export const generateReceiptPDF = async (receiptData) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header tipo AFIP / Comercial - Recibo X
  doc.setLineWidth(0.4);
  doc.rect(10, 10, pageWidth - 20, 45);
  doc.line(pageWidth / 2, 10, pageWidth / 2, 55);

  // Letra X en el medio
  doc.setFillColor(255, 255, 255);
  doc.rect((pageWidth / 2) - 8, 10, 16, 16, 'FD');
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('X', pageWidth / 2, 21, { align: 'center' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('COD. 099', pageWidth / 2, 29, { align: 'center' });
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('DOCUMENTO NO VÁLIDO', pageWidth / 2, 33, { align: 'center' });
  doc.text('COMO FACTURA', pageWidth / 2, 36, { align: 'center' });

  // Datos Empresa (Izquierda)
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('4S CLIMA', 15, 22);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Razón Social: 4S CLIMA S.A.', 15, 30);
  doc.text('Domicilio Comercial: CABA', 15, 35);
  doc.text('Condición frente al IVA: Monotributista', 15, 40);

  // Datos Recibo (Derecha)
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('RECIBO DE COBRANZA', pageWidth / 2 + 10, 22);
  doc.setFontSize(10);
  const recNumber = receiptData.receiptNumber || '00000001';
  doc.text(`Comp. Nro: ${recNumber.startsWith('REC-') ? recNumber : `REC-${String(recNumber).padStart(8, '0')}`}`, pageWidth / 2 + 10, 30);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha de Emisión: ${formatDate(receiptData.date || new Date())}`, pageWidth / 2 + 10, 36);
  doc.text('CUIT: 23477380719', pageWidth / 2 + 10, 41);
  doc.text('Ingresos Brutos: 23477380719', pageWidth / 2 + 10, 46);
  doc.text('Inicio de Actividades: 01/01/2023', pageWidth / 2 + 10, 51);

  // Datos del Cliente
  doc.rect(10, 58, pageWidth - 20, 25);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('CUIT / DNI:', 15, 66);
  doc.setFont('helvetica', 'normal');
  doc.text(receiptData.clientCuit || 'Consumidor Final', 45, 66);

  doc.setFont('helvetica', 'bold');
  doc.text('Condición frente al IVA:', 110, 66);
  doc.setFont('helvetica', 'normal');
  const cleanCuit = (receiptData.clientCuit || '').replace(/\D/g, '');
  doc.text(cleanCuit.length === 11 ? 'IVA Responsable Inscripto' : 'Consumidor Final', 155, 66);

  doc.setFont('helvetica', 'bold');
  doc.text('Razón Social:', 15, 73);
  doc.setFont('helvetica', 'normal');
  doc.text(receiptData.clientName || 'Cliente', 45, 73);

  doc.setFont('helvetica', 'bold');
  doc.text('Domicilio:', 15, 80);
  doc.setFont('helvetica', 'normal');
  doc.text(receiptData.clientAddress || 'Sin especificar', 45, 80);

  // Frase formal de recepción
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'italic');
  doc.text(
    `Recibimos la suma de $${(receiptData.totalAmount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })} en concepto de pago según el siguiente detalle:`,
    10,
    91
  );

  // Tabla 1: Comprobantes / Facturas Imputadas
  const items = (receiptData.orders || []).map((o, idx) => {
    const compDesc = o.afip_voucher_number ? `Factura C N° ${o.afip_voucher_number}` : `OT ${o.order_number || o.id?.slice(0, 8)}`;
    const fecha = formatDate(o.completed_at || o.created_at || new Date());
    const tipo = WORK_ORDER_TYPE_LABELS[o.type] || o.type || 'Mantenimiento';
    const monto = Number(o.total_amount) || 0;
    return [
      String(idx + 1).padStart(2, '0'),
      compDesc,
      `OT ${o.order_number || '-'} — ${tipo}`,
      fecha,
      `$${monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    ];
  });

  autoTable(doc, {
    startY: 96,
    head: [['#', 'Comprobante Imputado', 'Detalle de Trabajo', 'Fecha', 'Importe Imputado']],
    body: items.length > 0 ? items : [['01', 'Cancelación de saldo pendiente', 'Servicios técnicos de climatización', formatDate(new Date()), `$${(receiptData.totalAmount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`]],
    theme: 'grid',
    headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 45 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 25, halign: 'center' },
      4: { cellWidth: 35, halign: 'right' }
    }
  });

  let currentY = doc.lastAutoTable.finalY + 8;

  // Tabla 2: Medios de Pago y Valores
  const paymentRows = [
    ['Forma de Pago', receiptData.paymentMethod || 'Transferencia Bancaria'],
    ['Referencia / N° Transacción', receiptData.paymentReference || 'S/N'],
    ['Fecha de Acreditación', formatDate(receiptData.paymentDate || new Date())]
  ];
  if (receiptData.retentions && Number(receiptData.retentions) > 0) {
    paymentRows.push(['Retenciones Impositivas deducidas', `$${Number(receiptData.retentions).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`]);
  }
  if (receiptData.notes) {
    paymentRows.push(['Observaciones', receiptData.notes]);
  }

  autoTable(doc, {
    startY: currentY,
    head: [['Detalle del Pago / Medio de Cobro', 'Información']],
    body: paymentRows,
    theme: 'plain',
    headStyles: { fillColor: [229, 231, 235], textColor: [31, 41, 55], fontStyle: 'bold' },
    styles: { fontSize: 8.5, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 65, fontStyle: 'bold' },
      1: { cellWidth: 'auto' }
    }
  });

  currentY = doc.lastAutoTable.finalY + 12;

  // Cuadro Total Recibido
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(34, 197, 94);
  doc.rect(pageWidth - 95, currentY - 8, 85, 14, 'FD');

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 101, 52);
  doc.text(`TOTAL COBRADO: $${(receiptData.totalAmount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`, pageWidth - 15, currentY, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  // Firma y Constancia Administrativa
  const signatureY = Math.max(currentY + 35, 240);
  doc.line(pageWidth - 75, signatureY, pageWidth - 15, signatureY);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('4S CLIMA S.A.', pageWidth - 45, signatureY + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Administración y Cobranzas', pageWidth - 45, signatureY + 9, { align: 'center' });

  const fileName = `Recibo_X_${recNumber}.pdf`;
  return savePDF(doc, fileName);
};

/**
 * Genera el Estado de Cuenta Corriente PDF de un Cliente
 */
export const generateAccountStatementPDF = async (client, statementData) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header 4S Clima
  doc.setFillColor(30, 41, 59);
  doc.rect(10, 10, pageWidth - 20, 24, 'F');
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('4S CLIMA S.A. — ESTADO DE CUENTA CORRIENTE', 15, 22);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Emitido el: ${formatDate(new Date())}`, pageWidth - 15, 22, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  // Ficha del Cliente
  doc.rect(10, 38, pageWidth - 20, 24);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Cliente:', 15, 46);
  doc.setFont('helvetica', 'normal');
  doc.text(client.name || 'Cliente', 40, 46);

  doc.setFont('helvetica', 'bold');
  doc.text('CUIT:', 15, 52);
  doc.setFont('helvetica', 'normal');
  doc.text(client.cuit || 'Sin CUIT', 40, 52);

  doc.setFont('helvetica', 'bold');
  doc.text('Domicilio:', 110, 46);
  doc.setFont('helvetica', 'normal');
  doc.text(client.address || 'Sin especificar', 135, 46);

  doc.setFont('helvetica', 'bold');
  doc.text('Condición:', 110, 52);
  doc.setFont('helvetica', 'normal');
  doc.text('Cuenta Corriente Comercial', 135, 52);

  // Tabla de Movimientos
  const rows = (statementData.movements || []).map(m => [
    formatDate(m.date),
    m.voucherType,
    m.concept,
    m.debit > 0 ? `$${m.debit.toLocaleString('es-AR')}` : '-',
    m.credit > 0 ? `$${m.credit.toLocaleString('es-AR')}` : '-',
    `$${m.balance.toLocaleString('es-AR')}`
  ]);

  autoTable(doc, {
    startY: 68,
    head: [['Fecha', 'Comprobante', 'Detalle / Concepto', 'Debe (+)', 'Haber (-)', 'Saldo']],
    body: rows.length > 0 ? rows : [[formatDate(new Date()), '-', 'Sin movimientos registrados', '-', '-', '$0']],
    theme: 'grid',
    headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 32 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' }
    }
  });

  const finalY = doc.lastAutoTable.finalY + 12;

  // Resumen Saldo Actual
  doc.setFillColor(statementData.currentDebt > 0 ? 254 : 240, statementData.currentDebt > 0 ? 242 : 253, statementData.currentDebt > 0 ? 242 : 244);
  doc.setDrawColor(statementData.currentDebt > 0 ? 239 : 34, statementData.currentDebt > 0 ? 68 : 197, statementData.currentDebt > 0 ? 68 : 94);
  doc.rect(pageWidth - 95, finalY - 8, 85, 14, 'FD');

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(statementData.currentDebt > 0 ? 185 : 22, statementData.currentDebt > 0 ? 28 : 101, statementData.currentDebt > 0 ? 28 : 52);
  doc.text(`SALDO AL DÍA: $${(statementData.currentDebt || 0).toLocaleString('es-AR')}`, pageWidth - 15, finalY, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  // Cuadro informativo con datos bancarios para facilitar cobranza
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Datos para transferencias bancarias:', 15, finalY + 18);
  doc.setFont('helvetica', 'bold');
  doc.text('Banco: Galicia  |  CUIT: 23-47738071-9  |  Alias: CLIMA.4S.ADMIN  |  CBU: 0070000000000000000000', 15, finalY + 23);

  const fileName = `Estado_Cuenta_${(client.name || 'Cliente').replace(/\s+/g, '_')}.pdf`;
  return savePDF(doc, fileName);
};

/**
 * Genera la grilla de etiquetas QR para activos/equipos con estándar industrial HVAC.
 * Utiliza corrección de errores nivel 'H' (30% de redundancia física ante polvo, rayones o calor),
 * alto contraste puro (#000000 sobre #FFFFFF), bordes de corte punteados y metadatos técnicos.
 *
 * @param {Array|Object} equipmentList - Lista de equipos o un único equipo a imprimir
 * @param {string} [clientName] - Nombre del cliente o planta para el encabezado/archivo
 */
export const generateEquipmentQRLabelsPDF = async (equipmentList, clientName = 'Equipos') => {
  const items = Array.isArray(equipmentList) ? equipmentList : [equipmentList];
  if (items.length === 0) {
    throw new Error('No hay equipos seleccionados para generar etiquetas QR.');
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const marginLeft = 10;
  const marginTop = 12;
  const colGap = 6;
  const rowGap = 5;
  const labelWidth = 92;
  const labelHeight = 64;
  const labelsPerPage = 8; // 2 columnas x 4 filas

  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://4s-clima.com';

  for (let i = 0; i < items.length; i++) {
    const eq = items[i];
    const indexOnPage = i % labelsPerPage;

    if (i > 0 && indexOnPage === 0) {
      doc.addPage();
    }

    const col = indexOnPage % 2;
    const row = Math.floor(indexOnPage / 2);

    const x = marginLeft + col * (labelWidth + colGap);
    const y = marginTop + row * (labelHeight + rowGap);

    // 1. Marco exterior con guías de corte industrial (línea punteada sobria)
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([2, 2], 0);
    doc.rect(x, y, labelWidth, labelHeight);
    doc.setLineDashPattern([], 0); // restaurar patrón continuo

    // 2. Encabezado corporativo institucional (fondo oscuro elegante)
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(x + 1.5, y + 1.5, labelWidth - 3, 7.5, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('4S CLIMA', x + 3.5, y + 6.3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(203, 213, 225);
    doc.text('CONTROL INDUSTRIAL DE ACTIVOS', x + labelWidth - 3.5, y + 6.3, { align: 'right' });

    // 3. Generación de QR con ECC Nivel 'H' (High 30%)
    const token = (eq.qr_token || eq.id || '').toString().trim();
    const qrUrl = `${origin}/qr/${token}`;

    try {
      const qrDataUrl = await QRCode.toDataURL(qrUrl, {
        errorCorrectionLevel: 'H',
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      // Dibujar QR a la izquierda (33mm x 33mm)
      doc.addImage(qrDataUrl, 'PNG', x + 3, y + 11.5, 33, 33);
    } catch (err) {
      console.error('Error generando QR para equipo:', eq.id, err);
      doc.setDrawColor(239, 68, 68);
      doc.rect(x + 3, y + 11.5, 33, 33);
      doc.setFontSize(6);
      doc.setTextColor(239, 68, 68);
      doc.text('ERROR QR', x + 10, y + 28);
    }

    // 4. Bloque técnico a la derecha del QR (desde x + 38)
    const rightX = x + 38;

    // Token destacado en tipografía tabular monoespaciada
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(token, rightX, y + 15.5);

    // Tipo de equipo y Marca / Modelo
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text('EQUIPO:', rightX, y + 19.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(15, 23, 42);
    const typeLabel = EQUIPMENT_TYPE_LABELS[eq.type] || eq.type || 'Climatizador';
    const brandModel = `${eq.brand || ''} ${eq.model || ''}`.trim() || 'S/D';
    const fullEquip = `${typeLabel} - ${brandModel}`;
    doc.text(fullEquip.length > 25 ? fullEquip.substring(0, 24) + '...' : fullEquip, rightX, y + 23);

    // Número de Serie
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text('N° DE SERIE:', rightX, y + 27);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(15, 23, 42);
    doc.text(eq.serial_number || 'SIN NÚMERO', rightX, y + 30.5);

    // Planta y Ubicación física
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text('UBICACIÓN EN PLANTA:', rightX, y + 34.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(15, 23, 42);
    const plantName = eq.plant?.name || clientName || 'Planta Principal';
    const locationStr = eq.location_description
      ? `${plantName} (${eq.location_description})`
      : plantName;
    doc.text(locationStr.length > 26 ? locationStr.substring(0, 25) + '...' : locationStr, rightX, y + 38);

    // Estado Operativo con indicador industrial
    const status = eq.operational_status || 'operativo';
    const statusMap = {
      operativo: { label: 'OPERATIVO', r: 21, g: 128, b: 61 },
      con_observaciones: { label: 'OBSERVACIONES', r: 180, g: 83, b: 9 },
      fuera_de_servicio: { label: 'FUERA DE SERVICIO', r: 185, g: 28, b: 28 },
    };
    const stConfig = statusMap[status] || statusMap.operativo;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(stConfig.r, stConfig.g, stConfig.b);
    doc.text(`ESTADO: ${stConfig.label}`, rightX, y + 42.5);

    // 5. Pie sobrio institucional con call-to-action
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(x + 1.5, y + 48.5, labelWidth - 3, 14, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.line(x + 1.5, y + 48.5, x + labelWidth - 1.5, y + 48.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(30, 41, 59);
    doc.text('HISTORIAL TÉCNICO Y SOLICITUD DE SERVICE', x + (labelWidth / 2), y + 54, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.2);
    doc.setTextColor(100, 116, 139);
    doc.text('Escanear con cámara para soporte técnico directo y trazabilidad', x + (labelWidth / 2), y + 58.5, { align: 'center' });
  }

  const cleanClient = (clientName || 'Equipos').replace(/[\s/\\:]+/g, '_');
  const fileName = `Etiquetas_QR_${cleanClient}.pdf`;
  return savePDF(doc, fileName);
};
