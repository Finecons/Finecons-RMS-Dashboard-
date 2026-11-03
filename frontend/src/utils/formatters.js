// Currency formatter for Indian Rupees (₹)
export const formatCurrency = (amount) => {
  if (amount === undefined || amount === null || isNaN(amount)) return "₹0.00";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
};

// Safe ASCII Currency Formatter for PDF & CSV (prevents font glyph distortion like apostrophe `'`)
export const formatPdfCurrency = (amount) => {
  if (amount === undefined || amount === null || isNaN(amount)) return "Rs. 0.00";
  const num = Number(amount);
  const formatted = Math.abs(num).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return num < 0 ? `-Rs. ${formatted}` : `Rs. ${formatted}`;
};

export const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  } catch (e) {
    return dateStr;
  }
};

/**
 * Groups invoices by Account Manager in Ascending Alphabetical Order (A to Z)
 * Computes individual AM Subtotals (Total Cr, Total Dr / Ending Pending, Net)
 * and overall Grand Totals.
 */
export const groupInvoicesByAccountManager = (invoices = []) => {
  const groupsMap = {};

  invoices.forEach(inv => {
    const amName = (inv.account_manager_name || "").trim() || "Direct / Unassigned";
    if (!groupsMap[amName]) {
      groupsMap[amName] = {
        accountManagerName: amName,
        accountManagerId: inv.account_manager_id || null,
        invoices: [],
        totalCr: 0,
        totalDr: 0,
        endingPending: 0,
        netPending: 0,
        invoiceCount: 0
      };
    }

    const amt = parseFloat(inv.pending_amount) || 0;
    const isCr = inv.amount_type === 'Cr';

    groupsMap[amName].invoices.push(inv);
    groupsMap[amName].invoiceCount += 1;

    if (isCr) {
      groupsMap[amName].totalCr += amt;
    } else {
      groupsMap[amName].totalDr += amt;
    }
  });

  // Calculate Net for each AM and sort AMs in ascending order (A to Z)
  const sortedAMNames = Object.keys(groupsMap).sort((a, b) => 
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );

  let grandTotalCr = 0;
  let grandTotalDr = 0;
  let grandTotalCount = 0;

  const sortedGroups = sortedAMNames.map(amName => {
    const grp = groupsMap[amName];
    grp.endingPending = grp.totalDr;
    grp.netPending = grp.totalDr - grp.totalCr;

    grandTotalCr += grp.totalCr;
    grandTotalDr += grp.totalDr;
    grandTotalCount += grp.invoiceCount;

    // Sort invoices inside the group by date descending or invoice number
    grp.invoices.sort((a, b) => (b.invoice_date || "").localeCompare(a.invoice_date || ""));

    return grp;
  });

  return {
    groups: sortedGroups,
    grandTotalCr,
    grandTotalDr,
    grandEndingPending: grandTotalDr,
    grandNetPending: grandTotalDr - grandTotalCr,
    grandTotalCount
  };
};

export const exportToCsv = (filename, data, headers) => {
  if (!data || !data.length) return;
  const headerKeys = Object.keys(headers);
  const headerLabels = Object.values(headers);

  const csvRows = [headerLabels.join(",")];
  for (const row of data) {
    const values = headerKeys.map((key) => {
      let val = row[key];
      if (val === undefined || val === null) val = "";
      val = String(val).replace(/"/g, '""');
      return `"${val}"`;
    });
    csvRows.push(values.join(","));
  }

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Exports Consolidated Report to CSV grouped by Account Manager in ascending order
 * with the Account Manager Name on EVERY row,
 * AM-wise Subtotals (Cr Value & Ending Dr Value), Remarks, and Grand Total.
 */
export const exportConsolidatedReceivablesToCsv = (filename, invoices) => {
  const groupedData = groupInvoicesByAccountManager(invoices);
  const csvRows = [];

  // CSV Headers
  const headers = [
    "Account Manager",
    "Invoice Ref (PK)",
    "Billing Date",
    "Client / Party Name",
    "Overdue Days",
    "Cr Value (Credit Amount)",
    "Ending Value (Pending Dr Amount)",
    "Remarks (Status Update)",
    "Aging Status",
    "Status"
  ];
  csvRows.push(headers.map(h => `"${h}"`).join(","));

  groupedData.groups.forEach(grp => {
    // 1. Invoice Rows (with Account Manager name on EVERY row)
    grp.invoices.forEach(inv => {
      const isCr = inv.amount_type === 'Cr';
      const crVal = isCr ? Number(inv.pending_amount).toFixed(2) : "";
      const drVal = !isCr ? Number(inv.pending_amount).toFixed(2) : "";

      const remarkText = inv.am_remarks || inv.remarks || "";
      const remarkFormatted = remarkText 
        ? `[${inv.am_remarks_date ? formatDate(inv.am_remarks_date) : 'Update'}${inv.am_remarks_by ? ' • ' + inv.am_remarks_by : ''}] ${remarkText}`
        : "";

      const rowValues = [
        `"${grp.accountManagerName}"`,
        `"${inv.invoice_number}"`,
        `"${formatDate(inv.invoice_date)}"`,
        `"${(inv.party_name || "").replace(/"/g, '""')}"`,
        `"${inv.days_overdue} days"`,
        `"${crVal}"`,
        `"${drVal}"`,
        `"${remarkFormatted.replace(/"/g, '""')}"`,
        `"${inv.aging_status}"`,
        `"${inv.status}"`
      ];
      csvRows.push(rowValues.join(","));
    });

    // 2. AM Subtotal Row (shows Cr value and Ending Dr value)
    const subtotalValues = [
      `"SUBTOTAL FOR ${grp.accountManagerName.toUpperCase()}"`,
      '""',
      '""',
      `"Total Bills: ${grp.invoiceCount}"`,
      '""',
      `"${grp.totalCr.toFixed(2)}"`,
      `"${grp.endingPending.toFixed(2)}"`,
      `"Net: ${grp.netPending.toFixed(2)}"`,
      '""',
      '""'
    ];
    csvRows.push(subtotalValues.join(","));

    // Blank line between AM groups
    csvRows.push('""');
  });

  // 3. Company-Wide Grand Total Row
  const grandTotalValues = [
    `"COMPANY-WIDE GRAND TOTAL"`,
    '""',
    '""',
    `"Total Bills: ${groupedData.grandTotalCount}"`,
    '""',
    `"${groupedData.grandTotalCr.toFixed(2)}"`,
    `"${groupedData.grandEndingPending.toFixed(2)}"`,
    `"Company Net: ${groupedData.grandNetPending.toFixed(2)}"`,
    '""',
    '""'
  ];
  csvRows.push(grandTotalValues.join(","));

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
