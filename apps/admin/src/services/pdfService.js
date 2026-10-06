import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatDate } from '@4s-clima/shared/utils';
import { EQUIPMENT_TYPE_LABELS, WORK_ORDER_TYPE_LABELS } from '@4s-clima/shared/constants';

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
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
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
 * Genera y descarga el remito en PDF de una Orden de Trabajo.
 */
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

    const checklistData = wo.checklist_items.map(item => {
      let statusStr = "N/A";
      if (item.status === 'ok') statusStr = 'OK';
      else if (item.status === 'warning') statusStr = 'Atención';
      else if (item.status === 'fail') statusStr = 'Falla';
      return [item.item_name, statusStr, item.notes || '-'];
    });

    doc.autoTable({
      startY: currentY,
      head: [['Tarea', 'Estado', 'Observaciones']],
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
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("EVIDENCIA FOTOGRÁFICA", 15, currentY);
    currentY += 8;

    // Obtener las imágenes en base64 (Esto puede demorar unos segundos)
    const photoWidth = 55;
    const photoHeight = 40;
    let photoX = 15;

    for (const photo of wo.photos) {
      if (photoX + photoWidth > pageWidth - 15) {
        photoX = 15;
        currentY += photoHeight + 10;
        if (currentY > 240) {
          doc.addPage();
          currentY = 20;
        }
      }

      try {
        const base64Img = await getBase64ImageFromUrl(photo.url);
        if (base64Img) {
          doc.addImage(base64Img, 'JPEG', photoX, currentY, photoWidth, photoHeight);
          
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          let pLabel = "Foto";
          if (photo.type === 'before') pLabel = "Antes del servicio";
          else if (photo.type === 'after') pLabel = "Después del servicio";
          else if (photo.type === 'issue') pLabel = "Falla/Problema";
          
          doc.text(pLabel, photoX + (photoWidth/2), currentY + photoHeight + 4, { align: 'center' });
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
      if (sigBase64) {
        // La firma suele ser transparente, la dibujamos
        doc.addImage(sigBase64, 'PNG', 15, currentY, 60, 30);
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

  // Guardar y descargar
  const fileName = `Remito_${wo.order_number || wo.id.slice(0,5)}_${clientName.replace(/\s+/g, '_')}.pdf`;
  doc.save(fileName); // Descarga el archivo
  
  // Además abrimos el PDF en una pestaña nueva para visualizarlo rápido
  const pdfBlob = doc.output('bloburl');
  window.open(pdfBlob, '_blank');
};
