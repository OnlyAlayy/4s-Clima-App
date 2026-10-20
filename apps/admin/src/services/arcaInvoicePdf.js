import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { formatDate, roundCurrency } from '@4s-clima/shared/utils';
import { WORK_ORDER_TYPE_LABELS } from '@4s-clima/shared/constants';

/**
 * Carga imagen y la retorna en formato Base64 para jsPDF
 */
const getImageDataUrl = async (url) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
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
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

/**
 * Configura los metadatos y retorna { doc, fileName }
 */
const savePDF = (doc, fileName) => {
  const cleanFileName = (fileName || 'Factura_A.pdf')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
  const validFileName = cleanFileName.endsWith('.pdf') ? cleanFileName : `${cleanFileName}.pdf`;

  doc.setProperties({
    title: validFileName,
    subject: validFileName,
    author: '4S Clima - Silva Walter Jorge'
  });

  return { doc, fileName: validFileName };
};

/**
 * Formatea importes en estilo argentino: 187,305.41
 */
const formatNumberAR = (value) => {
  const num = Number(value) || 0;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

/**
 * Formatea CUIT con guiones: 20-22434754-6
 */
const formatCuit = (cuit) => {
  const clean = String(cuit || '').replace(/\D/g, '');
  if (clean.length === 11) {
    return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`;
  }
  return cuit || '20-22434754-6';
};

/**
 * Genera el documento PDF de Factura A (CbteTipo 001) clonando al 100%
 * la factura oficial A-00004-00000264 de 4S Clima.
 *
 * @param {Object} wo - Orden de trabajo con client, plant, extras, etc.
 * @param {Object} [customData] - Datos opcionales (concept, netAmount, etc.)
 * @returns {Promise<{ doc: jsPDF, fileName: string }>}
 */
export const generateArcaInvoicePDF = async (wo, customData = {}) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const client = wo.client || {};
  const clientName = (client.name || 'CLIENTE').toUpperCase();
  const clientAddress = client.address || 'Ciudad Autónoma de Buenos Aires, Argentina.';
  const clientCuit = formatCuit(client.cuit || '30712345678');
  const rawClientCuit = (client.cuit || '30712345678').toString().replace(/\D/g, '');

  // Parsear número de comprobante y punto de venta
  let ptoVta = 4;
  let nroCmp = 264;
  const voucherRaw = wo.afip_voucher_number || customData.voucherNumber || 'A-00004-00000264';
  const match = String(voucherRaw).match(/A?-?0*(\d{1,5})-0*(\d+)/i) || String(voucherRaw).match(/0*(\d+)/);

  if (match) {
    if (match[2]) {
      ptoVta = parseInt(match[1], 10) || 4;
      nroCmp = parseInt(match[2], 10) || 264;
    } else if (match[1]) {
      nroCmp = parseInt(match[1], 10) || 264;
    }
  }

  const formattedVoucherNumber = `A-${String(ptoVta).padStart(5, '0')}-${String(nroCmp).padStart(8, '0')}`;

  // Fechas
  const emissionDateObj = wo.completed_at ? new Date(wo.completed_at) : (wo.created_at ? new Date(wo.created_at) : new Date());
  const emissionDateStr = formatDate(emissionDateObj);

  // Fecha Vto. Pago: Emisión + 4 días corridos
  const vtoDateObj = new Date(emissionDateObj);
  vtoDateObj.setDate(vtoDateObj.getDate() + 4);
  const vtoDateStr = formatDate(vtoDateObj);

  // Cálculos matemáticos de Factura A (Neto + 21% IVA)
  let impTotal = 0;
  let impNeto = 0;
  let impIVA = 0;

  if (customData.netAmount !== undefined && Number(customData.netAmount) > 0) {
    impNeto = roundCurrency(customData.netAmount);
    impIVA = roundCurrency(impNeto * 0.21);
    impTotal = roundCurrency(impNeto + impIVA);
  } else if (wo.total_amount && Number(wo.total_amount) > 0) {
    impTotal = roundCurrency(wo.total_amount);
    impNeto = roundCurrency(impTotal / 1.21);
    impIVA = roundCurrency(impTotal - impNeto);
  } else {
    // Cálculo a partir de extras si no hay monto fijo
    const extrasTotal = (wo.extras || []).reduce((sum, e) => sum + (e.quantity * e.unit_price), 0);
    impNeto = extrasTotal > 0 ? roundCurrency(extrasTotal) : 187305.41;
    impIVA = roundCurrency(impNeto * 0.21);
    impTotal = roundCurrency(impNeto + impIVA);
  }

  const cae = wo.afip_cae || customData.cae || '74391823791823';
  // Fecha Vto. CAE (+10 días habituales de AFIP)
  const caeVtoDateObj = new Date(emissionDateObj);
  caeVtoDateObj.setDate(caeVtoDateObj.getDate() + 10);
  const caeVtoDateStr = wo.afip_cae_expiration ? formatDate(wo.afip_cae_expiration) : formatDate(caeVtoDateObj);

  // Concepto / Observaciones
  const serviceType = WORK_ORDER_TYPE_LABELS[wo.type] || wo.type || 'Mantenimiento';
  const observationText = (customData.concept || wo.observations || `ACT MANT ${serviceType.toUpperCase()} - OT ${wo.order_number || wo.id?.slice(0, 8)}`).trim();

  // =========================================================================
  // 1. ENCABEZADO SUPERIOR (Recuadro con bordes negros y línea central)
  // =========================================================================
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  // Recuadro principal
  doc.rect(10, 10, 190, 42);
  // Línea divisoria central
  doc.line(105, 10, 105, 52);

  // --- MITAD IZQUIERDA (Emisor) ---
  // Logo
  try {
    const logoData = await getImageDataUrl('/logopngremito.png') || await getImageDataUrl('/logo4sclima.webp');
    if (logoData && logoData.dataUrl) {
      const targetHeight = 8;
      const targetWidth = targetHeight * logoData.ratio;
      doc.addImage(logoData.dataUrl, 'PNG', 14, 13, Math.min(targetWidth, 24), targetHeight);
    }
  } catch (err) {
    console.warn('[arcaInvoicePdf] Logo no disponible:', err);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text('4S CLIMA', 14, 25);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Razón Social: ', 14, 30);
  doc.setFont('helvetica', 'normal');
  doc.text('Silva Walter Jorge', 35, 30);

  doc.setFont('helvetica', 'bold');
  doc.text('Domicilio: ', 14, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Vuelta De Obligado 3199 P13 D27, Capital Federal, CABA', 29, 34);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Responsable Inscripto', 14, 48);

  // --- CAJA CENTRAL SUPERIOR (Letra Fiscal 'A' / '001') ---
  doc.setFillColor(255, 255, 255);
  doc.rect(98, 10, 14, 13, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('A', 105, 19, { align: 'center' });
  doc.setFontSize(7.5);
  doc.text('001', 105, 22.5, { align: 'center' });

  // --- MITAD DERECHA (Datos del Comprobante) ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('FACTURA DE VENTA', 112, 17);

  doc.setFontSize(10);
  doc.text(`Comp. Nro: ${formattedVoucherNumber}`, 112, 23.5);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Fecha de Emisión:', 112, 29.5);
  doc.setFont('helvetica', 'normal');
  doc.text(emissionDateStr, 142, 29.5);

  doc.setFont('helvetica', 'bold');
  doc.text('CUIT:', 112, 34.5);
  doc.setFont('helvetica', 'normal');
  doc.text('20-22434754-6', 125, 34.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Ing. Brutos:', 112, 39.5);
  doc.setFont('helvetica', 'normal');
  doc.text('20224347546', 132, 39.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Inicio Act.:', 112, 44.5);
  doc.setFont('helvetica', 'normal');
  doc.text('01/03/2022', 130, 44.5);

  // =========================================================================
  // 2. RECUADRO DE DATOS DEL CLIENTE
  // =========================================================================
  doc.rect(10, 54, 190, 24);

  // Columna Izquierda
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Sr. (es):', 14, 59.5);
  doc.text(clientName, 27, 59.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Domicilio:', 14, 64.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(clientAddress, 30, 64.5);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Moneda:', 14, 69.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Pesos Argentinos', 28, 69.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Prov. Destino:', 14, 74.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Ciudad Autónoma de Buenos Aires', 36, 74.5);

  // Columna Derecha
  doc.setFont('helvetica', 'bold');
  doc.text('CUIT:', 112, 59.5);
  doc.setFont('helvetica', 'normal');
  doc.text(clientCuit, 123, 59.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Cond. IVA:', 112, 64.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Responsable Inscripto', 130, 64.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Fecha Vto.:', 112, 69.5);
  doc.setFont('helvetica', 'normal');
  doc.text(vtoDateStr, 131, 69.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Forma de pago:', 112, 74.5);
  doc.setFont('helvetica', 'normal');
  doc.text(wo.payment_method || 'Cuenta Corriente', 138, 74.5);

  // =========================================================================
  // 3. TABLA PRINCIPAL DE CONCEPTOS (9 Columnas Exactas)
  // =========================================================================
  const rows = [
    [
      '01',
      serviceType,
      observationText,
      '1.00',
      formatNumberAR(impNeto),
      '0.00',
      formatNumberAR(impNeto),
      '21.00%',
      formatNumberAR(impTotal)
    ]
  ];

  autoTable(doc, {
    startY: 80,
    head: [['Cód.', 'Artículo', 'Observaciones', 'Cantidad', 'Precio', '% Dto.', 'Importe', 'Alíc. IVA', 'Impt. c/IVA']],
    body: rows,
    theme: 'grid',
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 8,
      lineWidth: 0.3,
      lineColor: [0, 0, 0],
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [0, 0, 0],
      lineWidth: 0.2,
      lineColor: [0, 0, 0],
      cellPadding: 3
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 26 },
      2: { cellWidth: 50 },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 12, halign: 'center' },
      6: { cellWidth: 22, halign: 'right' },
      7: { cellWidth: 14, halign: 'center' },
      8: { cellWidth: 20, halign: 'right' }
    },
    margin: { left: 10, right: 10 }
  });

  // =========================================================================
  // 4. GRILLA INFERIOR DE ALÍCUOTAS IVA + BARRA GRIS DE TOTALES
  // =========================================================================
  const yIvaGrid = 228;
  const colWidth = 38; // 190 / 5 = 38mm

  doc.setLineWidth(0.3);
  doc.setDrawColor(0, 0, 0);

  // 5 Celdas de IVA
  const ivaBoxes = [
    { label: 'IVA 2.5: 0.00', x: 10 },
    { label: 'IVA 5: 0.00', x: 10 + colWidth },
    { label: 'IVA 10.5: 0.00', x: 10 + colWidth * 2 },
    { label: `IVA 21: ${formatNumberAR(impIVA)}`, x: 10 + colWidth * 3 },
    { label: 'IVA 27: 0.00', x: 10 + colWidth * 4 }
  ];

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');

  ivaBoxes.forEach((box) => {
    doc.rect(box.x, yIvaGrid, colWidth, 7);
    doc.text(box.label, box.x + colWidth / 2, yIvaGrid + 4.8, { align: 'center' });
  });

  // Barra Gris de Totales
  const yTotalsBar = yIvaGrid + 7;
  doc.setFillColor(204, 204, 204); // #cccccc
  doc.rect(10, yTotalsBar, 190, 8.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);

  doc.text(`Bruto: ${formatNumberAR(impNeto)}`, 14, yTotalsBar + 5.5);
  doc.text(`Impuestos: ${formatNumberAR(impIVA)}`, 105, yTotalsBar + 5.5, { align: 'center' });
  doc.text(`Total: $ ${formatNumberAR(impTotal)}`, 195, yTotalsBar + 5.5, { align: 'right' });

  // =========================================================================
  // 5. PIE OFICIAL ARCA + CÓDIGO QR + CAE
  // =========================================================================
  const yFooter = yTotalsBar + 10.5;
  doc.rect(10, yFooter, 190, 39);

  // Formato de fecha para QR oficial AFIP: YYYY-MM-DD
  const qrDateStr = emissionDateObj.toISOString().split('T')[0];

  const qrPayload = {
    ver: 1,
    fecha: qrDateStr,
    cuit: 20224347546,
    ptoVta: ptoVta,
    tipoCmp: 1,
    nroCmp: nroCmp,
    importe: impTotal,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: 80,
    nroDocRec: parseInt(rawClientCuit, 10) || 30712345678,
    tipoCodAut: 'E',
    codAut: parseInt(String(cae).replace(/\D/g, ''), 10) || 74391823791823
  };

  const qrJsonBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(qrPayload))));
  const qrFullUrl = `https://www.afip.gob.ar/fe/qr/?p=${qrJsonBase64}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(qrFullUrl, {
      margin: 1,
      width: 140,
      errorCorrectionLevel: 'M'
    });
    doc.addImage(qrDataUrl, 'PNG', 13, yFooter + 3.5, 32, 32);
  } catch (err) {
    console.warn('[arcaInvoicePdf] Error generando QR:', err);
  }

  // Tipografía ARCA
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('ARCA', 48, yFooter + 14);

  doc.setFontSize(7);
  doc.text('AGENCIA DE RECAUDACIÓN', 48, yFooter + 18.5);
  doc.text('Y CONTROL ADUANERO', 48, yFooter + 22);

  // Centro
  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(9);
  doc.text('Comprobante Autorizado', 118, yFooter + 14, { align: 'center' });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.text(
    'Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación.',
    118,
    yFooter + 19,
    { align: 'center', maxWidth: 70 }
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Página 1', 118, yFooter + 33, { align: 'center' });

  // Derecha (CAE)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`CAE: ${cae}`, 194, yFooter + 15, { align: 'right' });
  doc.text(`Fecha Vto. CAE: ${caeVtoDateStr}`, 194, yFooter + 21, { align: 'right' });

  // Guardado
  const cleanNum = formattedVoucherNumber.replace(/[^\w-]/g, '_');
  const fileName = `Factura_A_${cleanNum}_${clientName.replace(/\s+/g, '_')}.pdf`;

  return savePDF(doc, fileName);
};

/**
 * Helper de descarga rápida para Factura A compatible con openAndDownloadPDF
 */
export const openAndDownloadArcaInvoicePDF = async (generatePromise, preOpenedTab) => {
  try {
    if (preOpenedTab && !preOpenedTab.closed) {
      preOpenedTab.close();
    }
    const { doc, fileName } = await generatePromise;
    const pdfBlob = doc.output('blob');

    if (window.showSaveFilePicker) {
      try {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'Factura A (PDF)',
            accept: { 'application/pdf': ['.pdf'] }
          }]
        });
        const writable = await fileHandle.createWritable();
        await writable.write(pdfBlob);
        await writable.close();
        return { fileName };
      } catch (cancelError) {
        return;
      }
    }

    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 2000);

    return { fileName };
  } catch (err) {
    if (preOpenedTab && !preOpenedTab.closed) {
      preOpenedTab.close();
    }
    console.error('[arcaInvoicePdf] Error en descarga:', err);
    throw err;
  }
};
