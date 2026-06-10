// WebUSB ESC/POS thermal printer helper.
// Works in Chromium-based browsers (Chrome, Edge, Opera) over HTTPS.
// The browser remembers paired devices per-origin, so users only pick once.

export interface PrintReceiptPayload {
  businessName?: string;
  saleId: string;
  createdAt: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  items: { brand: string; model: string; imei_serial: string; sale_price: number }[];
  total: number;
  footer?: string;
}

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const enc = new TextEncoder();

function concat(...parts: (Uint8Array | number[])[]) {
  const arrays = parts.map(p => p instanceof Uint8Array ? p : new Uint8Array(p));
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrays) { out.set(a, o); o += a.length; }
  return out;
}

function line(text = "") { return concat(enc.encode(text), [LF]); }
function center(on: boolean) { return new Uint8Array([ESC, 0x61, on ? 1 : 0]); }
function bold(on: boolean) { return new Uint8Array([ESC, 0x45, on ? 1 : 0]); }
function sizeBig(on: boolean) { return new Uint8Array([GS, 0x21, on ? 0x11 : 0x00]); }
function init() { return new Uint8Array([ESC, 0x40]); }
function cut() { return new Uint8Array([GS, 0x56, 0x00]); }
function feed(n: number) { return new Uint8Array([ESC, 0x64, n]); }

function pad(left: string, right: string, width = 32) {
  const l = left.slice(0, width - right.length - 1);
  const spaces = " ".repeat(Math.max(1, width - l.length - right.length));
  return l + spaces + right;
}

export function buildEscPos(r: PrintReceiptPayload): Uint8Array {
  const parts: Uint8Array[] = [];
  parts.push(init());
  parts.push(center(true));
  parts.push(bold(true)); parts.push(sizeBig(true));
  parts.push(line(r.businessName || "SGH POS"));
  parts.push(sizeBig(false)); parts.push(bold(false));
  parts.push(line("Sales Receipt"));
  parts.push(center(false));
  parts.push(line("--------------------------------"));
  parts.push(line(`Receipt: ${r.saleId.slice(0,8).toUpperCase()}`));
  parts.push(line(`Date: ${new Date(r.createdAt).toLocaleString()}`));
  if (r.customerName) parts.push(line(`Customer: ${r.customerName}`));
  if (r.customerPhone) parts.push(line(`Phone: ${r.customerPhone}`));
  if (r.customerAddress) parts.push(line(`Addr: ${r.customerAddress}`));
  parts.push(line("--------------------------------"));
  for (const it of r.items) {
    parts.push(line(`${it.brand} ${it.model}`.slice(0, 32)));
    parts.push(line(`  ${it.imei_serial}`.slice(0, 32)));
    parts.push(line(pad("  Price", `$${Number(it.sale_price).toFixed(2)}`)));
  }
  parts.push(line("--------------------------------"));
  parts.push(bold(true)); parts.push(sizeBig(true));
  parts.push(line(pad("TOTAL", `$${r.total.toFixed(2)}`, 16)));
  parts.push(sizeBig(false)); parts.push(bold(false));
  parts.push(line(""));
  parts.push(center(true));
  parts.push(line(r.footer || "Thank you for your purchase!"));
  parts.push(center(false));
  parts.push(feed(3));
  parts.push(cut());
  return concat(...parts);
}

// ---- WebUSB connection ----

interface USBLike {
  requestDevice: (opts: { filters: any[] }) => Promise<any>;
  getDevices: () => Promise<any[]>;
}

function getUsb(): USBLike | null {
  const nav: any = navigator;
  return nav?.usb ?? null;
}

export function isWebUsbSupported() { return !!getUsb(); }

// Common thermal printer USB vendor IDs (Epson, Star, Bixolon, Citizen, generic POS, etc.)
const PRINTER_FILTERS = [
  { vendorId: 0x04b8 }, // Epson
  { vendorId: 0x0519 }, // Star
  { vendorId: 0x1504 }, // Bixolon
  { vendorId: 0x1cbe }, // Citizen
  { vendorId: 0x0fe6 }, // ICS Advent / generic
  { vendorId: 0x0416 }, // Winbond / generic POS
  { vendorId: 0x28e9 }, // GD32 / generic
  { vendorId: 0x0483 }, // STMicro (some POS)
  { vendorId: 0x067b }, // Prolific (USB-Serial POS)
  { vendorId: 0x6868 }, // generic POS
  { vendorId: 0x154f }, // SNBC
  { vendorId: 0x0dd4 }, // Custom Engineering
  {}, // allow any as last resort
];

export async function pickPrinter() {
  const usb = getUsb();
  if (!usb) throw new Error("WebUSB not supported in this browser. Use Chrome or Edge.");
  const device = await usb.requestDevice({ filters: PRINTER_FILTERS });
  try {
    localStorage.setItem("printer:paired", JSON.stringify({
      vendorId: device.vendorId, productId: device.productId, name: device.productName || "Printer",
    }));
  } catch {}
  return device;
}

export async function getPairedPrinter(): Promise<any | null> {
  const usb = getUsb();
  if (!usb) return null;
  const devices = await usb.getDevices();
  if (!devices.length) return null;
  try {
    const stored = JSON.parse(localStorage.getItem("printer:paired") || "null");
    if (stored) {
      const match = devices.find((d: any) => d.vendorId === stored.vendorId && d.productId === stored.productId);
      if (match) return match;
    }
  } catch {}
  return devices[0];
}

export function getPairedPrinterInfo(): { name: string; vendorId: number; productId: number } | null {
  try { return JSON.parse(localStorage.getItem("printer:paired") || "null"); } catch { return null; }
}

export function forgetPrinter() {
  try { localStorage.removeItem("printer:paired"); } catch {}
}

export async function printViaUsb(device: any, data: Uint8Array) {
  if (!device.opened) await device.open();
  if (!device.configuration) await device.selectConfiguration(1);
  // Find first interface with a bulk OUT endpoint
  let interfaceNumber = -1;
  let endpointNumber = -1;
  for (const iface of device.configuration.interfaces) {
    for (const alt of iface.alternates) {
      const out = alt.endpoints.find((e: any) => e.direction === "out" && e.type === "bulk");
      if (out) { interfaceNumber = iface.interfaceNumber; endpointNumber = out.endpointNumber; break; }
    }
    if (interfaceNumber >= 0) break;
  }
  if (interfaceNumber < 0) throw new Error("No bulk OUT endpoint found on printer.");
  try { await device.claimInterface(interfaceNumber); } catch (e: any) {
    throw new Error(`Could not claim printer interface. ${e?.message || ""} On Linux/ChromeOS you may need to release it from CUPS first.`);
  }
  await device.transferOut(endpointNumber, data);
}

export async function printReceiptToPaired(payload: PrintReceiptPayload) {
  let device = await getPairedPrinter();
  if (!device) device = await pickPrinter();
  await printViaUsb(device, buildEscPos(payload));
}
