import fs from "fs";
import path from "path";
import { createRequire } from "module";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

import type { InsertDocumentChunk, ManualRegion } from "../drizzle/schema";
import * as documentDb from "./documentDb";
import { buildLexicalTerms, generateChunkEmbedding } from "./uploadRouter";
import { stripFootnoteMarkers } from "../shared/text";

const moduleRequire = createRequire(import.meta.url);
const PDFJS_BASE_PATH = path.dirname(moduleRequire.resolve("pdfjs-dist/package.json"));
const CMAP_PATH = path.join(PDFJS_BASE_PATH, "cmaps") + "/";
const STANDARD_FONT_PATH = path.join(PDFJS_BASE_PATH, "standard_fonts") + "/";

type NormalizedBBox = { x: number; y: number; width: number; height: number };

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const LINE_THRESHOLD_FACTOR = 0.008;
const POSITION_TOLERANCE = 2;

const VARIANT_NEUTRAL_TERMS = new Set([
  "труба",
  "труб",
  "трубы",
  "трубн",
  "sanext",
  "санекст",
  "pex",
  "pe",
  "pexa",
  "pe-xa",
  "px",
  "pn",
  "sdr",
]);

type SearchMetadata = {
  original: string;
  normalized: string | null;
  slug: string | null;
  tokens: string[];
};

const CLEAN_TOKEN_REGEX = /[^0-9a-zа-яё]+/giu;

function tokenizeForMetadata(value?: string | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ё/g, "е")
    .split(CLEAN_TOKEN_REGEX)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function buildVariantMetadata(value?: string | null): SearchMetadata | null {
  if (!value) return null;
  const original = value.trim();
  if (!original) return null;
  const tokens = tokenizeForMetadata(original);
  if (!tokens.length) {
    return {
      original,
      normalized: null,
      slug: null,
      tokens: [],
    };
  }
  const filtered = tokens.filter((token) => !VARIANT_NEUTRAL_TERMS.has(token));
  if (!filtered.length) {
    return {
      original,
      normalized: null,
      slug: null,
      tokens: [],
    };
  }
  const normalized = filtered.join(" ").trim();
  const slug = filtered.join("-");
  return {
    original,
    normalized: normalized || null,
    slug: slug || null,
    tokens: Array.from(new Set(filtered)),
  };
}

function buildGroupMetadata(value?: string | null): SearchMetadata | null {
  if (!value) return null;
  const original = value.trim();
  if (!original) return null;
  const tokens = tokenizeForMetadata(original);
  if (!tokens.length) {
    return {
      original,
      normalized: null,
      slug: null,
      tokens: [],
    };
  }
  const normalized = tokens.join(" ").trim();
  const slug = tokens.join("-");
  return {
    original,
    normalized: normalized || null,
    slug: slug || null,
    tokens: Array.from(new Set(tokens)),
  };
}

interface TextItemWithPosition {
  text: string;
  x: number;
  y: number;
}

function estimateTokenCount(text: string): number {
  if (!text) return 0;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(wordCount, Math.round(text.length / 4));
}

function detectLanguage(text: string): string {
  if (/[А-ЯЁа-яё]/.test(text)) return "ru";
  if (/[A-Za-z]/.test(text)) return "en";
  return "unknown";
}

function mapRegionTypeToElement(regionType: ManualRegion["regionType"]): "text" | "table" | "figure" | "list" {
  if (regionType === "table_with_articles") {
    return "table";
  }
  return regionType;
}

function determineElementTypeFromRegions(
  regions: ManualRegion[]
): "text" | "table" | "figure" | "list" {
  if (
    regions.some(
      (region) =>
        region.regionType === "table" || region.regionType === "table_with_articles"
    )
  ) {
    return "table";
  }
  if (regions.some((region) => region.regionType === "figure")) {
    return "figure";
  }
  if (regions.some((region) => region.regionType === "list")) {
    return "list";
  }
  return "text";
}

function resolveNormalizedBBox(region: ManualRegion): NormalizedBBox | null {
  const coords = region.coordinates;
  if (!coords) return null;

  if (coords.normalizedBBox) {
    return coords.normalizedBBox;
  }

  const scaleAtCapture = coords.scaleAtCapture ?? 1;
  if (coords.bbox && coords.pageDimensions) {
    const displayWidth = coords.pageDimensions.width * scaleAtCapture;
    const displayHeight = coords.pageDimensions.height * scaleAtCapture;
    if (displayWidth > 0 && displayHeight > 0) {
      return {
        x: clamp(coords.bbox.x / displayWidth, 0, 1),
        y: clamp(coords.bbox.y / displayHeight, 0, 1),
        width: clamp(coords.bbox.width / displayWidth, 0, 1),
        height: clamp(coords.bbox.height / displayHeight, 0, 1),
      };
    }
  }

  if (coords.points && coords.points.length > 0 && coords.pageDimensions) {
    const xs = coords.points.map((p) => p.x);
    const ys = coords.points.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const displayWidth = coords.pageDimensions.width * scaleAtCapture;
    const displayHeight = coords.pageDimensions.height * scaleAtCapture;
    if (displayWidth > 0 && displayHeight > 0) {
      return {
        x: clamp(minX / displayWidth, 0, 1),
        y: clamp(minY / displayHeight, 0, 1),
        width: clamp((maxX - minX) / displayWidth, 0, 1),
        height: clamp((maxY - minY) / displayHeight, 0, 1),
      };
    }
  }

  return null;
}

function groupTextItemsIntoLines(
  items: TextItemWithPosition[],
  pageHeight: number
): string {
  if (!items.length) {
    return "";
  }

  const lineThreshold = Math.max(
    LINE_THRESHOLD_FACTOR * pageHeight,
    POSITION_TOLERANCE * 2
  );

  const sorted = [...items].sort((a, b) => {
    if (Math.abs(a.y - b.y) < lineThreshold) {
      return a.x - b.x;
    }
    return a.y - b.y;
  });

  const lines: string[] = [];
  let currentLine: string[] = [];
  let currentY: number | null = null;

  sorted.forEach((item) => {
    if (!item.text) {
      return;
    }
    if (currentY === null || Math.abs(item.y - currentY) < lineThreshold) {
      currentLine.push(item.text);
      currentY = currentY === null ? item.y : (currentY + item.y) / 2;
    } else {
      lines.push(currentLine.join(" "));
      currentLine = [item.text];
      currentY = item.y;
    }
  });

  if (currentLine.length > 0) {
    lines.push(currentLine.join(" "));
  }

  return stripFootnoteMarkers(lines.join("\n").replace(/\s+\n/g, "\n").trim());
}

function buildTableRowsFromItems(
  items: TextItemWithPosition[],
  pageHeight: number
): string[][] | null {
  if (!items.length) {
    return null;
  }

  const rowThreshold = Math.max(
    LINE_THRESHOLD_FACTOR * pageHeight,
    POSITION_TOLERANCE * 2
  );
  const columnThreshold = Math.max(pageHeight * 0.015, POSITION_TOLERANCE * 3);

  const sorted = [...items].sort((a, b) => a.y - b.y);
  const rows: Array<{ y: number; cells: Array<{ x: number; text: string }> }> =
    [];

  sorted.forEach((item) => {
    if (!item.text) return;
    const lastRow = rows[rows.length - 1];
    if (lastRow && Math.abs(item.y - lastRow.y) < rowThreshold) {
      lastRow.cells.push({ x: item.x, text: item.text });
    } else {
      rows.push({
        y: item.y,
        cells: [{ x: item.x, text: item.text }],
      });
    }
  });

  if (rows.length < 2) {
    return null;
  }

  rows.forEach((row) => row.cells.sort((a, b) => a.x - b.x));

  const anchors: number[] = [];
  rows.forEach((row) => {
    row.cells.forEach((cell) => {
      const existingIndex = anchors.findIndex(
        (anchor) => Math.abs(anchor - cell.x) < columnThreshold
      );
      if (existingIndex === -1) {
        anchors.push(cell.x);
      } else {
        anchors[existingIndex] =
          (anchors[existingIndex] + cell.x) / 2;
      }
    });
  });

  if (anchors.length < 2) {
    return null;
  }

  const sortedAnchors = [...anchors].sort((a, b) => a - b);

  const rowsWithColumns = rows.map((row) => {
    const cells = new Array(sortedAnchors.length).fill("");
    row.cells.forEach((cell) => {
      const idx = findClosestColumn(sortedAnchors, cell.x);
      if (idx === -1) return;
      cells[idx] = cells[idx]
        ? `${cells[idx]} ${cell.text}`.trim()
        : cell.text.trim();
    });
    return cells;
  });

  return rowsWithColumns;
}

function findClosestColumn(anchors: number[], value: number): number {
  if (!anchors.length) return -1;
  let closestIndex = 0;
  let closestDistance = Math.abs(anchors[0] - value);
  for (let i = 1; i < anchors.length; i += 1) {
    const distance = Math.abs(anchors[i] - value);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = i;
    }
  }
  return closestIndex;
}

function convertTableRowsToRecords(
  rows: string[][] | null,
  headersOverride?: string[]
): Array<Record<string, string>> | null {
  if (!rows || !rows.length) return null;
  const meaningfulRows = rows.filter((row) =>
    row.some((cell) => cell && cell.trim().length > 0)
  );
  if (!meaningfulRows.length) return null;

  if (headersOverride && headersOverride.length) {
    const normalized = meaningfulRows.map((row) => {
      const arr = row.map((cell) => cell?.trim() ?? "");
      while (arr.length < headersOverride.length) {
        arr.push("");
      }
      return arr;
    });

    return normalized.map((row) => {
      const record: Record<string, string> = {};
      headersOverride.forEach((column, idx) => {
        record[column] = row[idx] ?? "";
      });
      return record;
    });
  }

  if (meaningfulRows.length < 2) return null;

  const headerIndex = meaningfulRows.findIndex(
    (row) => row.filter((cell) => cell && cell.trim().length > 0).length >= 2
  );
  if (headerIndex === -1) return null;

  const headerRow = meaningfulRows[headerIndex].map((cell, idx) =>
    cell && cell.trim().length > 0 ? cell.trim() : `Колонка ${idx + 1}`
  );
  const columnNames = ensureUniqueHeaders(headerRow);

  const dataRows = meaningfulRows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cell && cell.trim().length > 0));

  if (!dataRows.length) return null;

  return dataRows.map((row) => {
    const record: Record<string, string> = {};
    columnNames.forEach((column, idx) => {
      record[column] = row[idx]?.trim() ?? "";
    });
    return record;
  });
}

function ensureUniqueHeaders(headers: string[]): string[] {
  const counts = new Map<string, number>();
  return headers.map((header) => {
    const key = header || "Колонка";
    const current = counts.get(key) ?? 0;
    counts.set(key, current + 1);
    if (current === 0) {
      return key;
    }
    return `${key} ${current + 1}`;
  });
}

function mergeTableJsonArrays(
  tables: Array<Array<Record<string, string>>>
): Array<Record<string, string>> | null {
  if (!tables.length) {
    return null;
  }

  let referenceColumns: string[] | null = null;
  const merged: Array<Record<string, string>> = [];
  let invalidStructure = false;

  tables.forEach((table) => {
    if (!table.length || invalidStructure) return;
    const columns = Object.keys(table[0]);
    if (!columns.length) return;
    if (!referenceColumns) {
      referenceColumns = columns;
    } else if (
      columns.length !== referenceColumns.length ||
      columns.some((col, idx) => col !== referenceColumns![idx])
    ) {
      invalidStructure = true;
      return;
    }
    merged.push(...table);
  });

  if (invalidStructure || !referenceColumns || !merged.length) {
    return null;
  }

  return merged;
}

function deriveTableStructure(rows: string[][] | null): TableStructure | null {
  if (!rows || !rows.length) return null;
  const width = Math.max(...rows.map((row) => row.length));
  if (!width) return null;

  const normalized = rows.map((row) => {
    const arr = row.map((cell) => sanitizeCellValue(cell));
    while (arr.length < width) {
      arr.push("");
    }
    return arr;
  });

  let headerEnd = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    const row = normalized[i];
    const nonEmpty = row.filter((cell) => cell.length > 0).length;
    if (!nonEmpty) {
      headerEnd = i + 1;
      continue;
    }
    const alphaCells = row.filter(hasAlpha).length;
    const digitCells = row.filter(hasDigit).length;
    if (
      alphaCells >= Math.max(1, Math.round(nonEmpty * 0.6)) &&
      digitCells <= Math.round(nonEmpty * 0.5)
    ) {
      headerEnd = i + 1;
    } else {
      break;
    }
  }

  if (headerEnd === 0) {
    headerEnd = 1;
  }

  const headerRows = normalized.slice(0, headerEnd);
  const bodyRows = normalized
    .slice(headerEnd)
    .filter((row) => row.some((cell) => cell.length > 0));
  if (!bodyRows.length) {
    return null;
  }

  const headers = new Array(width).fill("");
  headerRows.forEach((row) => {
    row.forEach((cell, idx) => {
      if (!cell) return;
      headers[idx] = headers[idx] ? `${headers[idx]} ${cell}`.trim() : cell;
    });
  });

  const cleaned = pruneTableColumns(headers, bodyRows);
  if (!cleaned.headers.length) {
    return null;
  }

  const uniqueHeaders = ensureUniqueHeaders(cleaned.headers);

  return {
    headers: uniqueHeaders,
    rows: cleaned.rows,
  };
}

function pruneTableColumns(headers: string[], rows: string[][]) {
  const keepIndexes: number[] = [];

  headers.forEach((header, idx) => {
    const headerNormalized = header.trim();
    const nonEmptyCells = rows.filter(
      (row) => (row[idx] ?? "").trim().length > 0
    ).length;
    const isPlaceholder =
      headerNormalized.length === 0 ||
      /^колон/iu.test(headerNormalized) ||
      /^column/i.test(headerNormalized);

    if (!isPlaceholder || nonEmptyCells > 1) {
      keepIndexes.push(idx);
    }
  });

  if (!keepIndexes.length) {
    keepIndexes.push(
      ...headers.map((_, idx) => idx).slice(0, Math.min(headers.length, 3))
    );
  }

  const filteredHeaders = keepIndexes.map((idx) => headers[idx]?.trim() || "");
  const filteredRows = rows.map((row) =>
    keepIndexes.map((idx) => row[idx]?.trim() || "")
  );

  return { headers: filteredHeaders, rows: filteredRows };
}

function sanitizeCellValue(value: string | undefined): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function hasAlpha(value: string | undefined): boolean {
  if (!value) return false;
  return /[A-Za-zА-Яа-яЁё]/.test(value);
}

function hasDigit(value: string | undefined): boolean {
  if (!value) return false;
  return /\d/.test(value);
}

interface ExtractedRegionContent {
  text: string;
  tableMatrix?: string[][];
  tableJson?: Array<Record<string, string>>;
  tableStructure?: TableStructure | null;
  tableTitle?: string | null;
}

interface TableStructure {
  headers: string[];
  rows: string[][];
}

async function extractTextForRegion(
  page: pdfjsLib.PDFPageProxy,
  viewport: pdfjsLib.PageViewport,
  region: ManualRegion,
  normalizedBBox: NormalizedBBox
): Promise<ExtractedRegionContent> {
  const textContent = await page.getTextContent();
  const tolerance = POSITION_TOLERANCE;
  const bounds = {
    minX: normalizedBBox.x * viewport.width,
    maxX: (normalizedBBox.x + normalizedBBox.width) * viewport.width,
    minY: normalizedBBox.y * viewport.height,
    maxY: (normalizedBBox.y + normalizedBBox.height) * viewport.height,
  };

  const itemsWithPosition: TextItemWithPosition[] = (textContent.items as TextItem[])
    .map((item) => {
      const raw = (item.str || "").replace(/\s+/g, " ").trim();
      if (!raw) {
        return null;
      }
      const [vx, vy] = viewport.convertToViewportPoint(
        item.transform[4],
        item.transform[5]
      );
      return {
        text: raw,
        x: vx,
        y: vy,
      };
    })
    .filter((entry): entry is TextItemWithPosition => Boolean(entry));

  const filtered = itemsWithPosition.filter(
    (item) =>
      item.x >= bounds.minX - tolerance &&
      item.x <= bounds.maxX + tolerance &&
      item.y >= bounds.minY - tolerance &&
      item.y <= bounds.maxY + tolerance
  );

  const plainText = groupTextItemsIntoLines(filtered, viewport.height);

  let tableMatrix: string[][] | undefined;
  let tableStructure: TableStructure | null = null;
  let tableJson: Array<Record<string, string>> | null = null;
  const isTableRegion =
    region.regionType === "table" ||
    region.regionType === "table_with_articles" ||
    region.isNomenclatureTable;

  if (isTableRegion) {
    const rows = buildTableRowsFromItems(filtered, viewport.height);
    if (rows && rows.length) {
      tableMatrix = rows;
      tableStructure = deriveTableStructure(rows);
      tableJson = convertTableRowsToRecords(
        rows,
        tableStructure?.headers
      );
    }
  }

  return {
    text: plainText,
    tableMatrix,
    tableJson: tableJson ?? undefined,
    tableStructure,
    tableTitle: typeof region.notes === "string" ? region.notes : null,
  };
}

export async function generateChunksFromManualRegions(
  documentId: number,
  options?: { regenerateEmbeddings?: boolean }
) {
  const document = await documentDb.getDocumentById(documentId);
  if (!document) {
    throw new Error("Документ не найден");
  }

  const manualRegions = await documentDb.getDocumentManualRegions(documentId);
  if (manualRegions.length === 0) {
    throw new Error("Нет сохранённых областей для ручной разметки");
  }

  const uploadsDir = path.join(process.cwd(), "uploads", "documents");
  const pdfPath = path.resolve(uploadsDir, `${documentId}_${document.filename}`);
  if (!fs.existsSync(pdfPath)) {
    throw new Error("Файл документа не найден. Загрузите документ заново.");
  }

  const pdfData = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjsLib.getDocument({
    data: pdfData,
    cMapUrl: CMAP_PATH,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_PATH,
    useSystemFonts: true,
    isEvalSupported: false,
  });

  const pdf = await loadingTask.promise;
  const regionsByPage = new Map<number, ManualRegion[]>();
  manualRegions.forEach((region) => {
    const collection = regionsByPage.get(region.pageNumber) ?? [];
    collection.push(region);
    regionsByPage.set(region.pageNumber, collection);
  });

  const chunkRecords: InsertDocumentChunk[] = [];
  const warnings: string[] = [];
  let chunkIndex = 0;
  let skippedRegions = 0;

  for (const [pageNumber, regions] of regionsByPage.entries()) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });

    for (const region of regions) {
      const normalizedBBox = resolveNormalizedBBox(region);
      if (!normalizedBBox) {
        warnings.push(
          `Область #${region.id ?? "?"} на странице ${region.pageNumber} не содержит координат`
        );
        skippedRegions += 1;
        continue;
      }

      const extracted = await extractTextForRegion(
        page,
        viewport,
        region,
        normalizedBBox
      );

      const extractedText = extracted.text;

      if (!extractedText) {
        warnings.push(
          `Не удалось извлечь текст из области #${region.id ?? "?"} на странице ${region.pageNumber}`
        );
        skippedRegions += 1;
        continue;
      }

      if (region.id) {
        await documentDb.updateManualRegion(region.id, {
          extractedText,
        });
      }

      let embeddingVector: number[] | null = null;
      if (options?.regenerateEmbeddings !== false) {
        try {
          embeddingVector = await generateChunkEmbedding(extractedText);
        } catch (error) {
          console.error(
            `[ManualChunkGenerator] Failed to generate embedding for region ${region.id}:`,
            error
          );
          warnings.push(
            `Embedding не сгенерирован для области #${region.id ?? "?"}`
          );
        }
      }

      chunkRecords.push({
        documentId,
        chunkIndex,
        content: extractedText,
        tokenCount: estimateTokenCount(extractedText),
        embedding: embeddingVector ? JSON.stringify(embeddingVector) : null,
        pageNumber: region.pageNumber,
        sectionPath: null,
        elementType: mapRegionTypeToElement(region.regionType),
        tableJson: extracted.tableJson ?? null,
        language: detectLanguage(extractedText),
        bm25Terms: buildLexicalTerms(extractedText),
        chunkMetadata: {
          annotationType: region.regionType,
          isManualRegion: true,
          manualRegionId: region.id,
          isNomenclatureTable: region.isNomenclatureTable,
          productGroupId: region.productGroupId,
          notes: region.notes,
          bbox: region.coordinates?.normalizedBBox ?? normalizedBBox,
        },
      });

      chunkIndex += 1;
    }
  }

  await documentDb.deleteDocumentChunks(documentId);

  if (chunkRecords.length > 0) {
    await documentDb.insertDocumentChunks(chunkRecords);
  }

  await documentDb.updateDocumentChunksCount(documentId, chunkRecords.length);
  await documentDb.updateDocumentProgress(
    documentId,
    "completed",
    100,
    chunkRecords.length
      ? `Создано чанков: ${chunkRecords.length}`
      : "Ручные области обработаны, но текст не найден"
  );

  return {
    createdChunks: chunkRecords.length,
    skippedRegions,
    warnings,
  };
}

export async function generateChunkFromRegionSelection(
  documentId: number,
  regionIds: number[],
  options?: {
    regenerateEmbeddings?: boolean;
    chunkTitle?: string;
    productGroupId?: number;
    annotatedByUserId?: number;
  }
) {
  if (!regionIds || regionIds.length === 0) {
    throw new Error("Выберите хотя бы одну область для создания чанка");
  }

  const document = await documentDb.getDocumentById(documentId);
  if (!document) {
    throw new Error("Документ не найден");
  }

  const regions = await documentDb.getManualRegionsByIds(documentId, regionIds);
  if (regions.length === 0) {
    throw new Error("Не удалось найти выбранные области");
  }

  const missingIds = regionIds.filter(
    (id) => !regions.some((region) => region.id === id)
  );
  if (missingIds.length > 0) {
    throw new Error(`Некоторые области не найдены или принадлежат другому документу: ${missingIds.join(", ")}`);
  }

  const uploadsDir = path.join(process.cwd(), "uploads", "documents");
  const pdfPath = path.resolve(uploadsDir, `${documentId}_${document.filename}`);
  if (!fs.existsSync(pdfPath)) {
    throw new Error("Файл документа не найден. Загрузите документ заново.");
  }

  const pdfData = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjsLib.getDocument({
    data: pdfData,
    cMapUrl: CMAP_PATH,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_PATH,
    useSystemFonts: true,
    isEvalSupported: false,
  });

  const pdf = await loadingTask.promise;
  const pageCache = new Map<number, pdfjsLib.PDFPageProxy>();
  const viewportCache = new Map<number, pdfjsLib.PageViewport>();

const regionTexts: Array<{
  region: ManualRegion;
  text: string;
  tableJson?: Array<Record<string, string>> | null;
  tableStructure?: TableStructure | null;
  tableTitle?: string | null;
  normalizedBBox: NormalizedBBox;
}> = [];
  const warnings: string[] = [];

  const sortedRegions = [...regions].sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) {
      return a.pageNumber - b.pageNumber;
    }
    return (a.id ?? 0) - (b.id ?? 0);
  });

  for (const region of sortedRegions) {
    const normalizedBBox = resolveNormalizedBBox(region);
    if (!normalizedBBox) {
      warnings.push(
        `Область #${region.id ?? "?"} на странице ${region.pageNumber} не содержит координат`
      );
      continue;
    }

    let page = pageCache.get(region.pageNumber);
    if (!page) {
      page = await pdf.getPage(region.pageNumber);
      pageCache.set(region.pageNumber, page);
    }

    let viewport = viewportCache.get(region.pageNumber);
    if (!viewport) {
      viewport = page.getViewport({ scale: 1 });
      viewportCache.set(region.pageNumber, viewport);
    }

    const extracted = await extractTextForRegion(
      page,
      viewport,
      region,
      normalizedBBox
    );

    const extractedText = extracted.text;

    if (!extractedText) {
      warnings.push(
        `Не удалось извлечь текст из области #${region.id ?? "?"} на странице ${region.pageNumber}`
      );
      continue;
    }

    if (region.id) {
      await documentDb.updateManualRegion(region.id, {
        extractedText,
      });
    }

    regionTexts.push({
      region,
      text: extractedText,
      tableJson: extracted.tableJson ?? null,
      tableStructure: extracted.tableStructure ?? null,
      tableTitle: extracted.tableTitle ?? region.notes ?? null,
      normalizedBBox,
    });
  }

  if (regionTexts.length === 0) {
    throw new Error("Не удалось извлечь текст из выбранных областей");
  }

  const assignedProductGroupId = options?.productGroupId ?? null;
  let assignedProductGroup: Awaited<ReturnType<typeof documentDb.getProductGroup>> | null = null;
  if (assignedProductGroupId) {
    assignedProductGroup = await documentDb.getProductGroup(assignedProductGroupId);
    if (!assignedProductGroup || assignedProductGroup.documentId !== documentId) {
      throw new Error("Указанная товарная группа недоступна для этого документа");
    }
  }

  const variantInfo = buildVariantMetadata(options?.chunkTitle ?? null);
  const groupInfo = buildGroupMetadata(assignedProductGroup?.name ?? null);
  const metadataTagSet = new Set<string>();
  (groupInfo?.tokens ?? []).forEach((token) => metadataTagSet.add(token));
  (variantInfo?.tokens ?? []).forEach((token) => metadataTagSet.add(token));
  if (groupInfo?.slug) {
    metadataTagSet.add(`product:${groupInfo.slug}`);
  }
  if (variantInfo?.slug) {
    metadataTagSet.add(`variant:${variantInfo.slug}`);
  }
  const metadataTags = Array.from(metadataTagSet);

  const combinedText = regionTexts
    .map((entry) => entry.text)
    .filter((text) => text && text.trim().length > 0)
    .join("\n\n")
    .trim();
  const tableCandidates = regionTexts
    .map((entry) => entry.tableJson)
    .filter(
      (
        table
      ): table is Array<Record<string, string>> =>
        Array.isArray(table) && table.length > 0
    );
  const mergedTableJson = mergeTableJsonArrays(tableCandidates);


  if (!combinedText) {
    throw new Error("Содержимое выбранных областей пустое");
  }

  let embeddingVector: number[] | null = null;
  if (options?.regenerateEmbeddings !== false) {
    try {
      embeddingVector = await generateChunkEmbedding(combinedText);
    } catch (error) {
      console.error(
        `[ManualChunkGenerator] Failed to generate embedding for selected regions:`,
        error
      );
      warnings.push("Embedding не сгенерирован для выбранных областей");
    }
  }

  const chunkIndex = await documentDb.getNextChunkIndex(documentId);

  const elementType = determineElementTypeFromRegions(
    regionTexts.map((entry) => entry.region)
  );
  const sectionLabel =
    groupInfo?.original ??
    variantInfo?.original ??
    options?.chunkTitle ??
    regionTexts.find((entry) => entry.region.notes)?.region.notes ??
    null;
  const chunkMetadata = {
    annotationType: "manual_region_group",
    manualRegionIds: regionTexts
      .map((entry) => entry.region.id)
      .filter((id): id is number => typeof id === "number"),
    isManualRegion: true,
    title: options?.chunkTitle ?? null,
    section: groupInfo?.original ?? undefined,
    subsection: variantInfo?.original ?? undefined,
    isNomenclatureTable: regionTexts.some(
      (entry) => entry.region.isNomenclatureTable
    ),
    productGroupIds: regionTexts
      .map((entry) => entry.region.productGroupId)
      .filter((id): id is number => typeof id === "number"),
    assignedProductGroupId,
    productGroupId: assignedProductGroupId ?? null,
    productGroupName: assignedProductGroup?.name ?? null,
    productGroupSlug: groupInfo?.slug ?? null,
    productVariantName: options?.chunkTitle?.trim() || null,
    productVariantNormalized: variantInfo?.normalized ?? null,
    productVariantSlug: variantInfo?.slug ?? null,
    tags: metadataTags.length ? metadataTags : undefined,
    regions: regionTexts.map((entry) => ({
      regionId: entry.region.id,
      pageNumber: entry.region.pageNumber,
      type: entry.region.regionType,
      bbox: entry.normalizedBBox,
      text: entry.text,
      tableJson: entry.tableJson ?? null,
      tableStructure: entry.tableStructure ?? null,
      tableTitle: entry.tableTitle ?? null,
      isNomenclatureTable: entry.region.isNomenclatureTable ?? false,
      notes: entry.region.notes ?? null,
    })),
  };

  await documentDb.insertDocumentChunks([
    {
      documentId,
      chunkIndex,
      content: combinedText,
      tokenCount: estimateTokenCount(combinedText),
      embedding: embeddingVector ? JSON.stringify(embeddingVector) : null,
      pageNumber: Math.min(
        ...regionTexts.map((entry) => entry.region.pageNumber ?? Number.MAX_SAFE_INTEGER)
      ),
      sectionPath: sectionLabel,
      elementType,
      tableJson: mergedTableJson,
      language: detectLanguage(combinedText),
      bm25Terms: buildLexicalTerms(combinedText),
      chunkMetadata,
    },
  ]);

  if (options?.annotatedByUserId) {
    try {
      await documentDb.upsertChunkAnnotation({
        documentId,
        chunkIndex,
        annotationType: "manual_region_group",
        isNomenclatureTable: chunkMetadata.isNomenclatureTable ?? false,
        productGroupId: assignedProductGroupId,
        notes: chunkMetadata.title ?? null,
        annotatedBy: options.annotatedByUserId,
      });
    } catch (error) {
      console.error("[ManualChunkGenerator] Failed to upsert annotation for manual chunk:", error);
    }
  } else {
    console.warn("[ManualChunkGenerator] annotatedByUserId not provided; chunk annotation was not created");
  }

  const totalChunks = await documentDb.getDocumentChunkCount(documentId);
  await documentDb.updateDocumentChunksCount(documentId, totalChunks);

  return {
    createdChunkIndex: chunkIndex,
    totalChunks,
    warnings,
  };
}

