import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatPdfCurrency, formatDate, groupInvoicesByAccountManager } from './formatters';

/**
 * Generates and downloads a branded Finecons PDF Receivables Report
 * with Account Managers in Ascending Order (A to Z),
 * the Account Manager Name on EVERY single invoice row,
 * dedicated columns for Cr Value, Ending Dr Value, AM Remarks & MD Notes,
 * AM-wise Subtotals (Cr Value & Ending Dr Value), and Company-Wide Grand Totals.
 * Uses pure ASCII currency formatting (Rs.) to avoid font glyph distortion on 1st digits.
 */
export const exportReceivablesToPdf = ({
  title = "Receivables Ledger Report",
  subtitle = "Finecons Private Limited • RMS Enterprise Portal",
  invoices = [],
  filterInfo = "All Records",
  summaryMetrics = null,
  includeMDRemarks = false
}) => {
  // Create landscape A4 document
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Corporate Header Banner (Finecons Navy #194995)
  doc.setFillColor(25, 73, 149);
  doc.rect(0, 0, pageWidth, 22, 'F');

  // Orange Accent Stripe (#ec5424)
  doc.setFillColor(236, 84, 36);
  doc.rect(0, 22, pageWidth, 2, 'F');

  // Company Name & System Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('FINECONS PRIVATE LIMITED', 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('RMS — RECEIVABLES MANAGEMENT SYSTEM', 14, 17);

  // Generation Date/Time on Right Header
  const genTime = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  doc.setFontSize(8);
  doc.text(`Generated: ${genTime}`, pageWidth - 14, 14, { align: 'right' });

  // 2. Report Subheading & Active Filter Strip
  doc.setTextColor(15, 23, 42); // slate-900
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, 14, 32);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(subtitle, 14, 37);

  // Filter & Metric Badge
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, 40, pageWidth - 28, 10, 2, 2, 'F');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);

  // Group invoices by Account Manager in ascending order
  const groupedData = groupInvoicesByAccountManager(invoices);

  let filterSummaryText = `Filter Scope: ${filterInfo}  |  Total Invoices: ${groupedData.grandTotalCount} across ${groupedData.groups.length} Account Managers`;
  filterSummaryText += `  |  Total Cr: ${formatPdfCurrency(groupedData.grandTotalCr)}  |  Total Ending Pending (Dr): ${formatPdfCurrency(groupedData.grandEndingPending)}`;
  doc.text(filterSummaryText, 18, 46.5);

  // 3. Prepare Structured Table Rows (Account Manager on EVERY row, no extra banner rows)
  const tableRows = [];

  groupedData.groups.forEach(grp => {
    // 3A. Invoices under this Account Manager (AM name placed on every row)
    grp.invoices.forEach(inv => {
      let agingLabel = '> 90 Days';
      if (inv.status === 'SETTLED') agingLabel = 'Settled';
      else if (inv.amount_type === 'Cr') agingLabel = 'Credit Note (Cr)';
      else if (inv.aging_status === 'GREEN') agingLabel = '<= 30 Days';
      else if (inv.aging_status === 'ORANGE') agingLabel = '31-90 Days';

      const isCr = inv.amount_type === 'Cr';
      const crVal = isCr ? formatPdfCurrency(inv.pending_amount) : '-';
      const drVal = !isCr ? formatPdfCurrency(inv.pending_amount) : '-';

      const remarkText = inv.am_remarks || inv.remarks || "";
      const remarkStr = remarkText 
        ? `${inv.am_remarks_date ? '[' + formatDate(inv.am_remarks_date) + '] ' : ''}${remarkText}`
        : '-';

      const invRow = [
        inv.invoice_number,
        formatDate(inv.invoice_date),
        inv.party_name,
        grp.accountManagerName, // Account Manager populated on every row
        `${inv.days_overdue} d`,
        crVal,
        drVal,
        remarkStr,
        agingLabel
      ];
      invRow._isInvoice = true;
      invRow._isCr = isCr;
      tableRows.push(invRow);
    });

    // 3B. Account Manager Subtotal Row (shows Cr value and Ending Dr value)
    const subtotalRow = [
      `SUBTOTAL: ${grp.accountManagerName.toUpperCase()}`,
      '',
      `Bills: ${grp.invoiceCount}`,
      grp.accountManagerName,
      '',
      formatPdfCurrency(grp.totalCr),
      formatPdfCurrency(grp.endingPending),
      `Net: ${formatPdfCurrency(grp.netPending)}`,
      ''
    ];
    subtotalRow._isSubtotal = true;
    subtotalRow._amName = grp.accountManagerName;
    tableRows.push(subtotalRow);
  });

  // 3C. Company-Wide Grand Total Row
  const grandTotalRow = [
    'COMPANY-WIDE GRAND TOTAL',
    '',
    `Total Bills: ${groupedData.grandTotalCount}`,
    'ALL MANAGERS',
    '',
    formatPdfCurrency(groupedData.grandTotalCr),
    formatPdfCurrency(groupedData.grandEndingPending),
    `Net: ${formatPdfCurrency(groupedData.grandNetPending)}`,
    ''
  ];
  grandTotalRow._isGrandTotal = true;
  tableRows.push(grandTotalRow);

  // Headers
  const headHeaders = [
    'Invoice Ref (PK)',
    'Date',
    'Client / Party Name',
    'Account Manager',
    'Overdue',
    'Cr Value',
    'Ending Value (Dr)',
    'Remarks',
    'Aging Status'
  ];

  // Column Styles tailored to landscape A4 (269mm width)
  const columnStyles = {
    0: { fontStyle: 'bold', cellWidth: 28 },
    1: { cellWidth: 18 },
    2: { cellWidth: 'auto' },
    3: { cellWidth: 28 }, // Account Manager column on every row
    4: { halign: 'center', cellWidth: 14 },
    5: { halign: 'right', fontStyle: 'bold', cellWidth: 24 }, // Cr Value
    6: { halign: 'right', fontStyle: 'bold', cellWidth: 26 }, // Ending Value (Dr)
    7: { cellWidth: 42 }, // Remarks
    8: { halign: 'center', cellWidth: 20 }  // Aging Status
  };

  // 4. Generate AutoTable with Finecons Professional Styling
  autoTable(doc, {
    startY: 53,
    head: [headHeaders],
    body: tableRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1
    },
    headStyles: {
      fillColor: [25, 73, 149],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left'
    },
    columnStyles: columnStyles,
    didParseCell: (data) => {
      const rawRow = data.row.raw;

      // 1. Account Manager Subtotal Row
      if (rawRow && rawRow._isSubtotal) {
        data.cell.styles.fillColor = [241, 245, 249]; // slate-100
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 8;

        if (data.column.index === 0) {
          data.cell.styles.textColor = [15, 23, 42]; // slate-900
        } else if (data.column.index === 5) {
          // Cr Value column in subtotal
          data.cell.styles.textColor = [124, 58, 237]; // purple-700
        } else if (data.column.index === 6) {
          // Ending Value (Dr) column in subtotal
          data.cell.styles.textColor = [25, 73, 149]; // navy-700
        } else if (data.column.index === 7) {
          data.cell.styles.textColor = [4, 120, 87]; // emerald-700
        }
      }

      // 2. Company-Wide Grand Total Row
      if (rawRow && rawRow._isGrandTotal) {
        data.cell.styles.fillColor = [25, 73, 149]; // navy-700
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 8.5;
      }

      // 3. Invoices Highlighting
      if (rawRow && rawRow._isInvoice) {
        // Cr Value cell styling
        if (data.column.index === 5 && rawRow._isCr) {
          data.cell.styles.textColor = [124, 58, 237]; // purple-700
        }
        // Ending Value Dr cell styling
        if (data.column.index === 6 && !rawRow._isCr) {
          data.cell.styles.textColor = [15, 23, 42];
        }

        // Aging Status cell styling
        const agingColIdx = includeMDRemarks ? 9 : 8;
        if (data.column.index === agingColIdx) {
          const val = data.cell.raw;
          if (val === 'Settled') {
            data.cell.styles.textColor = [100, 116, 139];
            data.cell.styles.fillColor = [248, 250, 252];
          } else if (val === 'Credit Note (Cr)') {
            data.cell.styles.textColor = [124, 58, 237];
            data.cell.styles.fillColor = [245, 243, 255];
          } else if (val === '<= 30 Days') {
            data.cell.styles.textColor = [22, 163, 74];
            data.cell.styles.fillColor = [240, 253, 244];
          } else if (val === '31-90 Days') {
            data.cell.styles.textColor = [217, 119, 6];
            data.cell.styles.fillColor = [254, 243, 199];
          } else if (val === '> 90 Days') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fillColor = [254, 242, 242];
          }
        }
      }
    },
    didDrawPage: (data) => {
      // Footer on every page
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(
        'Confidential • Finecons Private Limited Receivables Management System',
        14,
        pageHeight - 8
      );
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        pageWidth - 14,
        pageHeight - 8,
        { align: 'right' }
      );
    }
  });

  // 5. Save & Download the PDF
  const safeFilename = `Finecons_Receivables_${title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(safeFilename);
};
