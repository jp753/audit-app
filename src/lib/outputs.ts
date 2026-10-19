// Browser side of the downloads. Loaded only when a download is requested.
// Everything is bundled with the app, so it works with no signal.
import pdfMakeImport from 'pdfmake/build/pdfmake';
import regularUrl from '@expo-google-fonts/arimo/400Regular/Arimo_400Regular.ttf?url';
import boldUrl from '@expo-google-fonts/arimo/700Bold/Arimo_700Bold.ttf?url';
import italicUrl from '@expo-google-fonts/arimo/400Regular_Italic/Arimo_400Regular_Italic.ttf?url';
import boldItalicUrl from '@expo-google-fonts/arimo/700Bold_Italic/Arimo_700Bold_Italic.ttf?url';
import type { Audit, Brand } from '../types';
import { buildActionsDoc, buildReportDoc, FONT, type PdfPhoto } from './report-doc';
import { buildActionsWorkbook } from './xlsx';
import { getPhoto } from './db';
import { blobToDataUrl } from './bytes';

const pdfMake: any = (pdfMakeImport as any).default ?? pdfMakeImport;
let fontsReady: Promise<void> | null = null;

async function toBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Report font could not be loaded.');
  const dataUrl = await blobToDataUrl(await res.blob());
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

function ensureFonts() {
  if (!fontsReady) {
    fontsReady = (async () => {
      const [r, b, i, bi] = await Promise.all([regularUrl, boldUrl, italicUrl, boldItalicUrl].map(toBase64));
      pdfMake.addVirtualFileSystem({ 'Arimo-Regular.ttf': r, 'Arimo-Bold.ttf': b, 'Arimo-Italic.ttf': i, 'Arimo-BoldItalic.ttf': bi });
      pdfMake.setFonts({ [FONT]: { normal: 'Arimo-Regular.ttf', bold: 'Arimo-Bold.ttf', italics: 'Arimo-Italic.ttf', bolditalics: 'Arimo-BoldItalic.ttf' } });
      // Never fetch anything from the internet while making a PDF.
      pdfMake.setUrlAccessPolicy(() => false);
    })().catch((e) => { fontsReady = null; throw e; });
  }
  return fontsReady;
}

async function makePdf(doc: any): Promise<Blob> {
  await ensureFonts();
  return pdfMake.createPdf(doc).getBlob();
}

/** All of an audit's photos, in criterion order. */
async function photosFor(audit: Audit): Promise<PdfPhoto[]> {
  const out: PdfPhoto[] = [];
  for (const c of audit.library.criteria) {
    for (const id of audit.responses[c.id]?.photoIds ?? []) {
      const p = await getPhoto(id);
      if (p) out.push({ criterionId: c.id, dataUrl: await blobToDataUrl(p.blob), width: p.width, height: p.height });
    }
  }
  return out;
}

export async function reportPdf(audit: Audit, brand: Brand): Promise<Blob> {
  const photos = await photosFor(audit);
  return makePdf(buildReportDoc({ audit, brand, photos, version: __APP_VERSION__ }));
}

export async function actionsPdf(audit: Audit, brand: Brand): Promise<Blob> {
  return makePdf(buildActionsDoc(audit, brand, __APP_VERSION__));
}

export async function actionsXlsx(audit: Audit, brand: Brand): Promise<Blob> {
  const wb = buildActionsWorkbook(audit, brand);
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
