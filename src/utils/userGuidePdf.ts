/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import {
  USER_GUIDE_METADATA,
  USER_GUIDE_SECTIONS,
  GuideSection,
} from '../data/userGuideContent';

export interface GeneratedUserGuidePdf {
  blob: Blob;
  url: string;
  fileName: string;
  pageCount: number;
  pageImages: string[];
}

const PAGE_W = 1240;
const PAGE_H = 1754;
const MARGIN_X = 76;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const NAVY_DARK = '#001F3F';
const NAVY_MID = '#00264D';
const NAVY_BRAND = '#004B87';
const EMERALD = '#00A651';
const EMERALD_DARK = '#008742';
const SLATE_900 = '#0F172A';
const SLATE_700 = '#334155';
const SLATE_500 = '#64748B';
const BORDER_LIGHT = '#CBD5E1';
const BG_SOFT = '#F8FAFC';
const BG_TINT = '#EBF4FC';
const BG_TIP = '#ECFDF5';

const FONT_FAMILY = '"Cairo", "Segoe UI", "Tahoma", "Arial", sans-serif';

function createCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.direction = 'rtl';
  return [canvas, ctx];
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fillStyle?: string,
  strokeStyle?: string,
  lineWidth = 1.5
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();

  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  }
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string
): string[] {
  ctx.font = font;
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${current} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }

  return lines;
}

function drawRtlParagraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  rightX: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  font: string,
  color: string
): number {
  const lines = wrapTextLines(ctx, text, maxWidth, font);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.direction = 'rtl';

  let y = startY;
  for (const line of lines) {
    ctx.fillText(line, rightX, y);
    y += lineHeight;
  }
  return y;
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  pageNum: number,
  totalPages: number
) {
  const footerY = PAGE_H - 96;
  ctx.fillStyle = NAVY_DARK;
  ctx.fillRect(0, footerY, PAGE_W, 96);
  ctx.fillStyle = EMERALD;
  ctx.fillRect(0, footerY, PAGE_W, 5);

  ctx.direction = 'rtl';
  ctx.textBaseline = 'middle';

  // Attribution credit (right-aligned)
  ctx.font = `bold 20px ${FONT_FAMILY}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'right';
  ctx.fillText(USER_GUIDE_METADATA.footerCredit, PAGE_W - MARGIN_X, footerY + 48);

  // Page counter (left-aligned)
  ctx.font = `bold 20px ${FONT_FAMILY}`;
  ctx.fillStyle = '#00E676';
  ctx.textAlign = 'left';
  ctx.fillText(`صفحة ${pageNum} من ${totalPages}`, MARGIN_X, footerY + 48);
}

function drawCoverPage(totalPages: number): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas();

  // Top solid official Navy Hero Banner
  ctx.fillStyle = NAVY_DARK;
  ctx.fillRect(0, 0, PAGE_W, 540);
  ctx.fillStyle = EMERALD;
  ctx.fillRect(0, 540, PAGE_W, 12);

  // Decorative emblem circle
  drawRoundedRect(ctx, PAGE_W / 2 - 74, 72, 148, 148, 32, NAVY_BRAND, EMERALD, 4);
  ctx.direction = 'ltr';
  ctx.font = `900 44px ${FONT_FAMILY}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CRM', PAGE_W / 2, 128);
  ctx.font = `800 22px ${FONT_FAMILY}`;
  ctx.fillStyle = '#00E676';
  ctx.fillText('16395', PAGE_W / 2, 174);

  // Title & Subtitle centered in RTL
  ctx.direction = 'rtl';
  ctx.font = `900 40px ${FONT_FAMILY}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(USER_GUIDE_METADATA.title, PAGE_W / 2, 285);

  ctx.font = `700 24px ${FONT_FAMILY}`;
  ctx.fillStyle = '#BAE6FD';
  ctx.fillText(USER_GUIDE_METADATA.subtitle, PAGE_W / 2, 350);

  drawRoundedRect(ctx, PAGE_W / 2 - 220, 412, 440, 54, 14, EMERALD_DARK);
  ctx.font = `800 22px ${FONT_FAMILY}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(
    `${USER_GUIDE_METADATA.version} · ${new Date().toLocaleDateString('ar-EG')}`,
    PAGE_W / 2,
    439
  );

  // Table of Contents Summary Card
  let cursorY = 610;
  ctx.font = `900 30px ${FONT_FAMILY}`;
  ctx.fillStyle = NAVY_MID;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('محتويات الدليل التشغيلي وخطوات العمل:', PAGE_W - MARGIN_X, cursorY);
  cursorY += 56;

  USER_GUIDE_SECTIONS.forEach((sec) => {
    drawRoundedRect(ctx, MARGIN_X, cursorY, CONTENT_W, 102, 16, BG_SOFT, BORDER_LIGHT, 1.5);

    // Chapter badge on right
    drawRoundedRect(ctx, PAGE_W - MARGIN_X - 78, cursorY + 18, 62, 66, 14, NAVY_BRAND);
    ctx.font = `900 26px ${FONT_FAMILY}`;
    ctx.fillStyle = '#00E676';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sec.chapterNumber, PAGE_W - MARGIN_X - 47, cursorY + 51);

    // Title & Audience
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = `800 23px ${FONT_FAMILY}`;
    ctx.fillStyle = SLATE_900;
    ctx.fillText(sec.title, PAGE_W - MARGIN_X - 96, cursorY + 20);

    ctx.font = `600 19px ${FONT_FAMILY}`;
    ctx.fillStyle = EMERALD_DARK;
    ctx.fillText(`الفئة المستهدفة: ${sec.audience} · (${sec.steps.length} خطوات تنفيذية)`, PAGE_W - MARGIN_X - 96, cursorY + 58);

    cursorY += 116;
  });

  drawFooter(ctx, 1, totalPages);
  return canvas;
}

function drawSectionPage(
  section: GuideSection,
  pageNum: number,
  totalPages: number
): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas();

  // Top Header Strip
  ctx.fillStyle = NAVY_MID;
  ctx.fillRect(0, 0, PAGE_W, 152);
  ctx.fillStyle = EMERALD;
  ctx.fillRect(0, 152, PAGE_W, 6);

  // Chapter Pill Badge
  drawRoundedRect(ctx, PAGE_W - MARGIN_X - 88, 28, 88, 92, 18, EMERALD);
  ctx.font = `900 34px ${FONT_FAMILY}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(section.chapterNumber, PAGE_W - MARGIN_X - 44, 74);

  // Section Title & Audience
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.font = `900 30px ${FONT_FAMILY}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(section.title, PAGE_W - MARGIN_X - 108, 34);

  ctx.font = `700 20px ${FONT_FAMILY}`;
  ctx.fillStyle = '#00E676';
  ctx.fillText(`النطاق الوظيفي: ${section.audience}`, PAGE_W - MARGIN_X - 108, 86);

  let y = 186;

  // Summary Box
  const summaryFont = `600 21px ${FONT_FAMILY}`;
  const summaryLines = wrapTextLines(ctx, section.summary, CONTENT_W - 48, summaryFont);
  const summaryHeight = summaryLines.length * 34 + 34;
  drawRoundedRect(ctx, MARGIN_X, y, CONTENT_W, summaryHeight, 16, BG_TINT, NAVY_BRAND, 1.5);
  drawRtlParagraph(
    ctx,
    section.summary,
    PAGE_W - MARGIN_X - 24,
    y + 18,
    CONTENT_W - 48,
    34,
    summaryFont,
    NAVY_DARK
  );
  y += summaryHeight + 28;

  // Steps Heading
  ctx.font = `900 24px ${FONT_FAMILY}`;
  ctx.fillStyle = NAVY_BRAND;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('خطوات العمل والتنفيذ التفصيلية:', PAGE_W - MARGIN_X, y);
  y += 46;

  // Render Each Step Card
  const stepTitleFont = `800 22px ${FONT_FAMILY}`;
  const stepDescFont = `500 20px ${FONT_FAMILY}`;

  for (const step of section.steps) {
    const descLines = wrapTextLines(ctx, step.description, CONTENT_W - 120, stepDescFont);
    const cardHeight = Math.max(108, 56 + descLines.length * 31 + 22);

    drawRoundedRect(ctx, MARGIN_X, y, CONTENT_W, cardHeight, 16, BG_SOFT, BORDER_LIGHT, 1.5);

    // Emerald step circle badge on right
    drawRoundedRect(ctx, PAGE_W - MARGIN_X - 72, y + 22, 52, 52, 26, NAVY_BRAND);
    ctx.font = `900 24px ${FONT_FAMILY}`;
    ctx.fillStyle = '#00E676';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(step.number, PAGE_W - MARGIN_X - 46, y + 48);

    // Step Title
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = stepTitleFont;
    ctx.fillStyle = SLATE_900;
    ctx.fillText(step.title, PAGE_W - MARGIN_X - 92, y + 20);

    // Step Description
    drawRtlParagraph(
      ctx,
      step.description,
      PAGE_W - MARGIN_X - 92,
      y + 56,
      CONTENT_W - 120,
      31,
      stepDescFont,
      SLATE_700
    );

    y += cardHeight + 18;
  }

  // Optional Important Note Callout Box
  if (section.importantNote && y < PAGE_H - 250) {
    const noteFont = `700 20px ${FONT_FAMILY}`;
    const noteLines = wrapTextLines(ctx, `ملاحظة تشغيلية هامة: ${section.importantNote}`, CONTENT_W - 48, noteFont);
    const noteH = noteLines.length * 32 + 34;
    drawRoundedRect(ctx, MARGIN_X, y + 6, CONTENT_W, noteH, 16, BG_TIP, EMERALD, 2);
    drawRtlParagraph(
      ctx,
      `ملاحظة تشغيلية هامة: ${section.importantNote}`,
      PAGE_W - MARGIN_X - 24,
      y + 24,
      CONTENT_W - 48,
      32,
      noteFont,
      '#065F46'
    );
  }

  drawFooter(ctx, pageNum, totalPages);
  return canvas;
}

export function generateUserGuidePdf(): GeneratedUserGuidePdf {
  const totalPages = 1 + USER_GUIDE_SECTIONS.length;
  const canvases: HTMLCanvasElement[] = [
    drawCoverPage(totalPages),
    ...USER_GUIDE_SECTIONS.map((section, idx) =>
      drawSectionPage(section, idx + 2, totalPages)
    ),
  ];

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageImages: string[] = [];

  canvases.forEach((canvas, idx) => {
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    pageImages.push(imgData);
    if (idx > 0) {
      doc.addPage();
    }
    doc.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  });

  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);

  return {
    blob,
    url,
    fileName: USER_GUIDE_METADATA.fileName,
    pageCount: totalPages,
    pageImages,
  };
}
