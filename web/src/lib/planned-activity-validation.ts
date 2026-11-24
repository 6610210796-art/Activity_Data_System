export function getNextQuarter(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const currentQuarter =
    month >= 10 ? 1 : month <= 3 ? 2 : month <= 6 ? 3 : 4;
  const currentFiscalYear = year + (month >= 10 ? 1 : 0) + 543;

  if (currentQuarter === 4) {
    return { fiscalYear: currentFiscalYear + 1, quarterNo: 1 };
  }
  return { fiscalYear: currentFiscalYear, quarterNo: currentQuarter + 1 };
}

