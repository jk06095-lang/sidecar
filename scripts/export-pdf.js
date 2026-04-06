import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function exportHtmlToPdf() {
  const browser = await puppeteer.launch({
    headless: "new"
  });
  
  const page = await browser.newPage();
  
  // HTML 문서의 절대 경로를 가져옵니다.
  const htmlPath = path.resolve(__dirname, '../docs/USAGE_GUIDE.html');
  const fileUrl = `file://${htmlPath}`;
  
  console.log(`Loading HTML from: ${fileUrl}`);
  await page.goto(fileUrl, { waitUntil: 'networkidle0' });

  // PDF 출력 경로
  const pdfPath = path.resolve(__dirname, '../docs/USAGE_GUIDE_presentation.pdf');

  console.log('Exporting as slide show (16:9)...');
  await page.pdf({
    path: pdfPath,
    // 16:9 Aspect Ratio (PPT Size)
    width: '16in',
    height: '9in',
    printBackground: true,
    margin: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    }
  });

  console.log(`Successfully exported PDF to: ${pdfPath}`);
  
  await browser.close();
}

exportHtmlToPdf().catch(err => {
  console.error("Failed to export PDF:", err);
  process.exit(1);
});
