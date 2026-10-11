import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface PdfTableOptions {
  title: string;
  businessName?: string;
  subtitle?: string;
  head: string[];
  rows: (string | number)[][];
  summary?: [string, string][];
  filename: string;
  landscape?: boolean;
}

export const money = (n: number) => `$${Number(n || 0).toFixed(2)}`;

export function downloadTablePdf(o: PdfTableOptions) {
  const doc = new jsPDF({ orientation: o.landscape ? "landscape" : "portrait", unit: "mm", format: "a4", compress: true });
  const w = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold").setFontSize(15).text(o.businessName ?? "MPOFU Technologies", 14, 16);
  doc.setFont("helvetica", "normal").setFontSize(11).text(o.title, 14, 23);
  doc.setFontSize(8).setTextColor(110).text(`Generated ${new Date().toLocaleString()}`, w - 14, 16, { align: "right" });
  if (o.subtitle) doc.text(o.subtitle, 14, 28);
  doc.setTextColor(0);
  let y = o.subtitle ? 32 : 28;
  if (o.summary?.length) {
    autoTable(doc, {
      startY: y, body: o.summary, theme: "plain", styles: { fontSize: 9, cellPadding: 1 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } }, margin: { left: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 3;
  }
  autoTable(doc, {
    startY: y, head: [o.head], body: o.rows.map(r => r.map(String)),
    styles: { fontSize: 8, cellPadding: 1.6 }, headStyles: { fillColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [245, 247, 250] }, margin: { left: 14, right: 14 },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(8).setTextColor(130).text(`Page ${doc.getNumberOfPages()}`, w - 14, h - 8, { align: "right" });
      doc.setTextColor(0);
    },
  });
  doc.save(o.filename.endsWith(".pdf") ? o.filename : `${o.filename}.pdf`);
}
