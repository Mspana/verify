import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

// Client-side export pipeline for the result page. html2canvas rasterizes
// the passed element to a canvas; for PNG we dump that directly, for PDF
// we wrap it in a single A4-portrait page scaled to fit.
//
// scale: 2 is non-negotiable — without it the export renders at 1x device
// pixel ratio and looks washed out on retina / mobile screens. Doubling
// costs render time and file size but the output is actually usable.
//
// Images served by our Worker (preview + heatmap) need crossOrigin set on
// the <img> tags so html2canvas doesn't taint the canvas. The Worker
// returns Access-Control-Allow-Origin: * on those endpoints — see
// worker/src/handlers/assets.ts. Setting useCORS: true here is how
// html2canvas finds those tagged images.

export type ExportFormat = "pdf" | "png";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

function buildFilename(scanId: string, format: ExportFormat): string {
  const shortId = scanId.slice(0, 8);
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `verify-${shortId}-${yyyy}-${mm}-${dd}.${format}`;
}

async function renderToCanvas(target: HTMLElement): Promise<HTMLCanvasElement> {
  // Wait for web fonts to settle — fallback fonts would render otherwise.
  // Currently the app uses system fonts only, but this is free defense
  // against a future @font-face addition silently breaking exports.
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  return html2canvas(target, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    // Any element tagged with data-export-ignore is omitted from the
    // render. The Export button itself uses this so it doesn't appear
    // inside its own output.
    ignoreElements: (el) => el.getAttribute("data-export-ignore") === "true",
  });
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // iOS Safari quirk: programmatic download of PDFs doesn't always save —
  // the file opens in a new tab instead and the user has to use Share to
  // save it from there. Accepting this for MVP; no detection hack.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so the browser has time to kick off the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function exportPng(
  canvas: HTMLCanvasElement,
  filename: string,
): Promise<void> {
  // Read pixels synchronously via toDataURL, then convert to a Blob.
  // Using canvas.toBlob directly produced PNGs missing styled
  // backgrounds/fills with html2canvas-pro: the SVG foreignObject
  // content rasterized by html2canvas-pro doesn't always commit to the
  // canvas backing store until a synchronous read forces the flush.
  // toBlob fires asynchronously and can snapshot the canvas mid-flush,
  // while toDataURL is synchronous and forces the commit — the PDF path
  // worked for the same reason, it uses toDataURL.
  const dataUrl = canvas.toDataURL("image/png");
  const blob = await (await fetch(dataUrl)).blob();
  triggerDownload(blob, filename);
}

function exportPdf(canvas: HTMLCanvasElement, filename: string): void {
  const pdf = new jsPDF({
    format: "a4",
    orientation: "portrait",
    unit: "mm",
  });

  // Scale-to-fit: the canvas aspect ratio is preserved; width fills the
  // A4 content box, and if that would make height overflow the page we
  // shrink to fit the page height instead. No pagination — multi-page
  // is a stretch goal.
  const pageW = A4_WIDTH_MM;
  const pageH = A4_HEIGHT_MM;
  const margin = 10;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;

  const canvasRatio = canvas.width / canvas.height;
  const boxRatio = maxW / maxH;

  let drawW: number;
  let drawH: number;
  if (canvasRatio >= boxRatio) {
    drawW = maxW;
    drawH = maxW / canvasRatio;
  } else {
    drawH = maxH;
    drawW = maxH * canvasRatio;
  }
  const offsetX = (pageW - drawW) / 2;
  const offsetY = (pageH - drawH) / 2;

  const imgData = canvas.toDataURL("image/png");
  pdf.addImage(imgData, "PNG", offsetX, offsetY, drawW, drawH);
  pdf.save(filename);
}

export async function exportResult(
  target: HTMLElement,
  scanId: string,
  format: ExportFormat,
): Promise<void> {
  const canvas = await renderToCanvas(target);
  const filename = buildFilename(scanId, format);
  if (format === "png") {
    await exportPng(canvas, filename);
  } else {
    exportPdf(canvas, filename);
  }
}
