// Comprehensive Smart Remarks Commitment & Temporal Parser
// Resolves payment commitment months from natural Account Manager text + remark date timestamp

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const MONTH_PATTERNS = [
  { monthIndex: 0, regex: /\b(jan|january|janbr)\b/i, name: "January" },
  { monthIndex: 1, regex: /\b(feb|february|febbr)\b/i, name: "February" },
  { monthIndex: 2, regex: /\b(mar|march)\b/i, name: "March" },
  { monthIndex: 3, regex: /\b(apr|april)\b/i, name: "April" },
  { monthIndex: 4, regex: /\b(may)\b/i, name: "May" },
  { monthIndex: 5, regex: /\b(jun|june)\b/i, name: "June" },
  { monthIndex: 6, regex: /\b(jul|july)\b/i, name: "July" },
  { monthIndex: 7, regex: /\b(aug|august)\b/i, name: "August" },
  { monthIndex: 8, regex: /\b(sep|sept|september)\b/i, name: "September" },
  { monthIndex: 9, regex: /\b(oct|october|octbr)\b/i, name: "October" },
  { monthIndex: 10, regex: /\b(nov|november|novbr)\b/i, name: "November" },
  { monthIndex: 11, regex: /\b(dec|december|decbr)\b/i, name: "December" },
];

/**
 * Checks if a remark is empty or explicitly non-committal
 */
export const isNonCommittalRemark = (text) => {
  if (!text) return true;
  const s = String(text).trim().toLowerCase();
  if (s.length === 0) return true;
  if (/^[-–—.,\s]+$/.test(s)) return true;

  const exactIgnores = [
    "no remarks", "no remark", "nil", "na", "n/a", "none", "nothing", 
    "null", "undefined", "-", "--", "no update", "no notes", "no notes recorded"
  ];
  if (exactIgnores.includes(s)) return true;

  const vaguePrefixes = [
    "will update later", "update later", "updated later", "follow up later",
    "call later", "ringing", "not reachable", "switch off", "switched off",
    "busy", "no response", "in discussion", "waiting for po"
  ];
  // If it ONLY contains vague phrases without any date or timeframe reference
  const hasVague = vaguePrefixes.some(v => s.includes(v));
  const hasDateHint = /\b(oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|week|month|today|tomorrow|friday|monday|tuesday|wednesday|thursday|cheque|pdc|rtgs|neft|\d{1,2}[\/-]\d{1,2})\b/i.test(s);

  if (hasVague && !hasDateHint) return true;
  return false;
};

/**
 * Parses remark text and timestamp into structured commitment target
 * Returns { hasCommitment, targetMonthIndex, targetYear, targetMonthName, matchedPhrase, explanation }
 */
export const parseRemarkCommitment = (remarkText, remarkTimestamp) => {
  if (isNonCommittalRemark(remarkText)) {
    return { hasCommitment: false, reason: "Non-committal / Empty remark" };
  }

  const text = String(remarkText).trim();
  const lower = text.toLowerCase();

  // Reference base date (from remark timestamp or today)
  let baseDate = new Date();
  if (remarkTimestamp) {
    const parsed = new Date(remarkTimestamp);
    if (!isNaN(parsed.getTime())) {
      baseDate = parsed;
    }
  }

  const baseYear = baseDate.getFullYear();
  const baseMonth = baseDate.getMonth(); // 0 to 11
  const baseDay = baseDate.getDate();

  // 1. Direct Month Mentions (e.g. "October last week", "payment by Oct end", "Nov 1st week")
  for (const mp of MONTH_PATTERNS) {
    if (mp.regex.test(lower)) {
      let targetYear = baseYear;
      // If base is Nov/Dec and remark mentions Jan/Feb, it refers to next year
      if (baseMonth >= 10 && mp.monthIndex <= 1) {
        targetYear = baseYear + 1;
      }
      return {
        hasCommitment: true,
        targetMonthIndex: mp.monthIndex,
        targetYear: targetYear,
        targetMonthName: mp.name,
        matchedPhrase: text.match(mp.regex)?.[0] || mp.name,
        explanation: `Explicitly mentioned ${mp.name}`
      };
    }
  }

  // 2. Numeric Day/Month pattern: e.g. "25/10", "31-10-2026", "05.11"
  const dateNumMatch = lower.match(/\b(\d{1,2})[\/\.-](\d{1,2})(?:[\/\.-](\d{2,4}))?\b/);
  if (dateNumMatch) {
    const mNum = parseInt(dateNumMatch[2], 10);
    if (mNum >= 1 && mNum <= 12) {
      const mIdx = mNum - 1;
      let y = baseYear;
      if (dateNumMatch[3]) {
        y = parseInt(dateNumMatch[3], 10);
        if (y < 100) y += 2000;
      }
      return {
        hasCommitment: true,
        targetMonthIndex: mIdx,
        targetYear: y,
        targetMonthName: MONTH_NAMES[mIdx],
        matchedPhrase: dateNumMatch[0],
        explanation: `Numeric date ${dateNumMatch[0]} indicates ${MONTH_NAMES[mIdx]}`
      };
    }
  }

  // 3. Relative "Next Month" phrasing (e.g. "next month", "start of next month", "early next month")
  if (/\b(next month|following month|coming month)\b/i.test(lower)) {
    const nextMIdx = (baseMonth + 1) % 12;
    const nextYear = baseMonth === 11 ? baseYear + 1 : baseYear;
    return {
      hasCommitment: true,
      targetMonthIndex: nextMIdx,
      targetYear: nextYear,
      targetMonthName: MONTH_NAMES[nextMIdx],
      matchedPhrase: "next month",
      explanation: `Calculated from remark date (${baseDate.toLocaleDateString()}) -> ${MONTH_NAMES[nextMIdx]}`
    };
  }

  // 4. Relative "This Month" / Month End phrasing (e.g. "this month", "month end", "eom", "end of month")
  if (/\b(this month|month end|end of month|eom|by month close)\b/i.test(lower)) {
    return {
      hasCommitment: true,
      targetMonthIndex: baseMonth,
      targetYear: baseYear,
      targetMonthName: MONTH_NAMES[baseMonth],
      matchedPhrase: "month end",
      explanation: `Commitment for current month (${MONTH_NAMES[baseMonth]})`
    };
  }

  // 5. Relative Short-Term phrasing (e.g. "this week", "within this week", "by friday", "tomorrow")
  if (/\b(this week|within this week|by this weekend|coming friday|by friday|by monday|by wednesday|by thursday|by tuesday|tomorrow|day after tomorrow|in \d{1,2} days|within \d{1,2} days)\b/i.test(lower)) {
    // Add offset based on phrase
    let addDays = 3;
    const daysMatch = lower.match(/\b(in|within)\s+(\d{1,2})\s+days\b/);
    if (daysMatch) {
      addDays = parseInt(daysMatch[2], 10);
    } else if (lower.includes("tomorrow")) {
      addDays = 1;
    } else if (lower.includes("day after tomorrow")) {
      addDays = 2;
    }

    const targetDate = new Date(baseDate.getTime() + (addDays * 24 * 60 * 60 * 1000));
    const targetMIdx = targetDate.getMonth();
    const targetYear = targetDate.getFullYear();

    return {
      hasCommitment: true,
      targetMonthIndex: targetMIdx,
      targetYear: targetYear,
      targetMonthName: MONTH_NAMES[targetMIdx],
      matchedPhrase: "short-term / this week",
      explanation: `Short-term commitment calculated from ${baseDate.toLocaleDateString()} -> ${MONTH_NAMES[targetMIdx]}`
    };
  }

  // 6. "Next Week" phrasing (adds 7 days to remark date)
  if (/\b(next week|in a week|within a week|in 1 week)\b/i.test(lower)) {
    const targetDate = new Date(baseDate.getTime() + (7 * 24 * 60 * 60 * 1000));
    const targetMIdx = targetDate.getMonth();
    const targetYear = targetDate.getFullYear();
    return {
      hasCommitment: true,
      targetMonthIndex: targetMIdx,
      targetYear: targetYear,
      targetMonthName: MONTH_NAMES[targetMIdx],
      matchedPhrase: "next week",
      explanation: `Next week calculated from ${baseDate.toLocaleDateString()} -> ${MONTH_NAMES[targetMIdx]}`
    };
  }

  // 7. Cheque / PDC / Day of month (e.g. "cheque dated 28th", "pdc for 5th", "clearing on 30")
  const dayMatch = lower.match(/\b(?:cheque|pdc|payment|rtgs|neft|clearing|promised|date)?\s*(?:on|dated|for|by)?\s*(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (dayMatch && dayMatch[1]) {
    const dayNum = parseInt(dayMatch[1], 10);
    if (dayNum >= 1 && dayNum <= 31) {
      // If day is greater than or equal to baseDay, targets current month; otherwise next month
      let targetMIdx = baseMonth;
      let targetYear = baseYear;
      if (dayNum < baseDay) {
        targetMIdx = (baseMonth + 1) % 12;
        if (targetMIdx === 0) targetYear += 1;
      }
      return {
        hasCommitment: true,
        targetMonthIndex: targetMIdx,
        targetYear: targetYear,
        targetMonthName: MONTH_NAMES[targetMIdx],
        matchedPhrase: dayMatch[0],
        explanation: `Payment date (${dayNum}) maps to ${MONTH_NAMES[targetMIdx]}`
      };
    }
  }

  // If text has some content (e.g. "payment promised", "client agreed to pay") but no specific month,
  // classify as general commitment defaulted to current month
  if (/\b(pay|payment|clearing|settle|cheque|rtgs|transfer|dd|commit|committed|promise|promised)\b/i.test(lower)) {
    return {
      hasCommitment: true,
      targetMonthIndex: baseMonth,
      targetYear: baseYear,
      targetMonthName: MONTH_NAMES[baseMonth],
      matchedPhrase: "payment commitment",
      explanation: `Payment commitment in ${MONTH_NAMES[baseMonth]}`
    };
  }

  return { hasCommitment: false, reason: "No payment commitment date detected" };
};

/**
 * Filter invoices by commitment month
 * targetFilter: "ALL" | "OCTOBER" | "NOVEMBER" | "DECEMBER" | ... or month index 0..11
 */
export const filterInvoicesByRemarkMonth = (invoices = [], targetFilter = "ALL") => {
  const results = [];
  let sNo = 1;

  for (const inv of invoices) {
    const remarkText = inv.am_remarks || inv.remarks || "";
    const remarkDate = inv.am_remarks_date || inv.remarks_date || null;

    const analysis = parseRemarkCommitment(remarkText, remarkDate);
    if (!analysis.hasCommitment) continue;

    const isAll = targetFilter === "ALL" || targetFilter === "ALL_COMMITTED";
    let matchesTarget = false;

    if (isAll) {
      matchesTarget = true;
    } else if (typeof targetFilter === "number") {
      matchesTarget = analysis.targetMonthIndex === targetFilter;
    } else if (typeof targetFilter === "string") {
      const filterLower = targetFilter.toLowerCase();
      matchesTarget = analysis.targetMonthName.toLowerCase() === filterLower ||
                      String(analysis.targetMonthIndex) === filterLower;
    }

    if (matchesTarget) {
      results.push({
        sno: sNo++,
        account_manager_name: inv.account_manager_name || "Unassigned",
        party_name: inv.party_name || "-",
        invoice_number: inv.invoice_number,
        pending_amount: inv.pending_amount,
        amount_type: inv.amount_type || "Dr",
        remarks: remarkText,
        remark_date: remarkDate ? new Date(remarkDate).toLocaleDateString("en-GB") : "-",
        target_month: `${analysis.targetMonthName} ${analysis.targetYear}`,
        matched_phrase: analysis.matchedPhrase,
        explanation: analysis.explanation
      });
    }
  }

  return results;
};

/**
 * Exports filtered commitment remarks to CSV / Excel
 */
export const exportCommitmentRemarksToCsv = (filename, items = [], filterLabel = "All Committed") => {
  const headers = [
    "S.No",
    "Account Manager Name",
    "Client / Party Name",
    "Invoice Ref No (PK)",
    "Pending Amount (Rs)",
    "Type",
    "Remark Commitment Text",
    "Remark Updated Date",
    "Target Collection Month / Timeframe",
    "Detection Match"
  ];

  const csvRows = [];
  csvRows.push([`"FINECONS RMS - SMART REMARKS COMMITMENT REPORT (${filterLabel.toUpperCase()})"`]);
  csvRows.push([`"Generated on: ${new Date().toLocaleString()}"`]);
  csvRows.push([`"Total Committed Invoices: ${items.length}"`]);
  csvRows.push([]); // blank line
  csvRows.push(headers.map(h => `"${h}"`).join(","));

  let totalAmount = 0;
  for (const item of items) {
    const amt = item.pending_amount || 0;
    if (item.amount_type !== "Cr") {
      totalAmount += amt;
    } else {
      totalAmount -= amt;
    }

    const row = [
      `"${item.sno}"`,
      `"${(item.account_manager_name || "").replace(/"/g, '""')}"`,
      `"${(item.party_name || "").replace(/"/g, '""')}"`,
      `"${item.invoice_number}"`,
      `"${Number(amt).toFixed(2)}"`,
      `"${item.amount_type}"`,
      `"${(item.remarks || "").replace(/"/g, '""')}"`,
      `"${item.remark_date}"`,
      `"${item.target_month}"`,
      `"${(item.explanation || "").replace(/"/g, '""')}"`
    ];
    csvRows.push(row.join(","));
  }

  // Summary row
  csvRows.push([]);
  csvRows.push([
    `"TOTAL"`,
    `""`,
    `""`,
    `"Total Bills: ${items.length}"`,
    `"${totalAmount.toFixed(2)}"`,
    `""`,
    `""`,
    `""`,
    `""`,
    `""`
  ].join(","));

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

