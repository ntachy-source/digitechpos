import QRCode from "qrcode";

export const generateQrPayload = (imeiSerial: string) => {
  // Compact, scannable identifier. Prefix lets us validate scans.
  return `SPOS:${imeiSerial}`;
};

export const parseQrPayload = (text: string): string | null => {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith("SPOS:")) return trimmed.slice(5);
  return trimmed; // accept raw IMEI/serial too
};

export const renderQrToCanvas = async (canvas: HTMLCanvasElement, payload: string) => {
  await QRCode.toCanvas(canvas, payload, { width: 220, margin: 1 });
};

export const renderQrToDataUrl = async (payload: string) => {
  return QRCode.toDataURL(payload, { width: 320, margin: 1 });
};
