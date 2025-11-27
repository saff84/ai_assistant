# Анализ определения границ разделов для чанков и секций

## Анализ структуры документа на скриншоте

### Наблюдения из документа (страницы 16-18)

1. **Раздел 1.3 "Труба «Стабил»"**:
   - **Занимает страницы 16 и 17** (целые страницы)
   - Содержит: описание, преимущества, особенности применения, технические характеристики (таблица)
   - На странице 16: диаграмма структуры, маркировка, номенклатура (таблица), размеры бухт (таблица)
   - **Заканчивается в конце страницы 17**

2. **Раздел 1.4 "Труба «Тёплый пол»"**:
   - **Начинается с страницы 18** (новая страница)
   - Содержит: описание, изображение трубы

3. **Header страниц (важная особенность)**:
   - На каждой странице **вверху слева** есть header с указанием:
     - Основного раздела (например, "Трубы SANEXT")
     - Подраздела (например, "Труба «Стабил»" или "Труба «Тёплый пол»")
   - Header повторяется на каждой странице и указывает, к какому разделу относится страница
   - Это **дополнительный сигнал** для определения границ разделов

### Ключевые паттерны определения границ

1. **Заголовок нового раздела**:
   - Формат: `N.N[.N] Название` (например, "1.3. Труба «Стабил»", "1.4. Труба «Тёплый пол»")
   - Крупный шрифт (минимум на 10% больше среднего)
   - Жирный шрифт (желательно, но не обязательно)
   - Расположение: обычно в начале страницы или в начале раздела

2. **Конец раздела**:
   - Определяется появлением заголовка следующего раздела
   - **Обычно совпадает с концом страницы** (разделы занимают целые страницы)
   - Все элементы на странице относятся к разделу, указанному в header'е страницы

3. **Header страницы (критически важно)**:
   - Расположен вверху слева на каждой странице
   - Содержит информацию о разделе и подразделе
   - Может использоваться для **валидации** и **корректировки** определения границ разделов
   - Если header указывает на другой раздел, чем определенный по заголовку - это сигнал ошибки

4. **Структура раздела**:
   - Может содержать несколько таблиц (номенклатура, технические характеристики, размеры)
   - Может содержать диаграммы и изображения
   - Может содержать подзаголовки (не являющиеся разделами)
   - Может занимать несколько страниц (например, раздел 1.3 занимает страницы 16-17)

## Текущая реализация

### Сильные стороны

1. ✅ **Определение заголовков разделов** (`detectSectionFromLine`):
   - Проверка паттерна `^\s*(\d+(?:\.\d+){0,3})\s+(.+?)\s*$`
   - Проверка размера шрифта (минимум на 10% больше среднего)
   - Проверка жирного шрифта (желательно)
   - Фильтрация ложных срабатываний (единицы измерения, артикулы)

2. ✅ **Закрытие разделов при обнаружении нового**:
   - При обнаружении нового раздела закрывается предыдущий
   - Учитывается позиция на странице (`endLineIndex`, `endY`)
   - Закрываются sibling-разделы (с общим родителем)

3. ✅ **Отслеживание позиции**:
   - `startLineIndex` / `endLineIndex` - индекс строки на странице
   - `startY` / `endY` - Y-координата (baseline)
   - `pageStart` / `pageEnd` - диапазон страниц

### Проблемы и ограничения

1. ⚠️ **Неточное определение Y-координаты**:
   ```typescript
   // Текущая реализация использует fontSize как Y-координату
   const lineY = lineWithFont.fontSize; // ❌ Это не Y-координата!
   ```
   - `fontSize` - это размер шрифта, а не Y-координата
   - Нужно получать реальную Y-координату из `TextItem.transform[5]` (baseline)

2. ⚠️ **Привязка элементов к разделам**:
   - Элементы определяются по позиции в тексте (`blockLineIndex`)
   - Может быть неточным при сложной структуре страницы
   - Не учитывается реальная Y-координата элементов

3. ⚠️ **Обработка элементов на границе разделов**:
   - Элементы могут попадать в неправильный раздел, если они находятся на границе
   - Нужна более точная проверка позиции элемента относительно границ раздела

4. ⚠️ **Не используется информация из header'ов страниц**:
   - Header'ы страниц содержат важную информацию о разделе
   - Текущая реализация не извлекает и не использует header'ы
   - Header'ы могут быть использованы для валидации и корректировки границ разделов

## Предложения по улучшению

### 1. Извлечение и использование header'ов страниц (НОВОЕ - КРИТИЧЕСКИ ВАЖНО)

**Проблема**: Header'ы страниц содержат информацию о разделе, но не используются.

**Решение**: Извлекать header'ы страниц и использовать их для определения и валидации границ разделов.

```typescript
interface PageHeader {
  pageNumber: number;
  mainSection?: string; // Например, "Трубы SANEXT"
  subsection?: string; // Например, "Труба «Стабил»"
  sectionPath?: string; // Извлеченный sectionPath из header'а (например, "1.3")
  yPosition: number; // Y-координата header'а (обычно вверху страницы)
}

/**
 * Извлечение header'а страницы
 * Header обычно находится вверху страницы (первые 50-100 пикселей)
 */
function extractPageHeader(
  pageWithFonts: PdfPageWithFonts,
  pageNumber: number,
  pageHeight: number = 800 // Примерная высота страницы в пикселях
): PageHeader | null {
  const header: PageHeader = {
    pageNumber,
    yPosition: 0,
  };
  
  // Header обычно находится в верхней части страницы (первые 10-15% высоты)
  const headerThreshold = pageHeight * 0.15;
  
  // Ищем строки в верхней части страницы
  const headerLines = pageWithFonts.lines.filter(line => {
    if (line.baseline === null || line.baseline === undefined) return false;
    // В PDF координаты идут снизу вверх, поэтому большие значения = выше на странице
    // Или наоборот, в зависимости от системы координат PDF
    // Нужно проверить реальную систему координат в вашем PDF
    return line.baseline > (pageHeight - headerThreshold);
  });
  
  if (headerLines.length === 0) return null;
  
  // Анализируем header'ы
  // Паттерн 1: "Трубы SANEXT" - основной раздел
  // Паттерн 2: "Труба «Стабил»" или "1.3. Труба «Стабил»" - подраздел
  for (const line of headerLines) {
    const text = line.text.trim();
    
    // Проверяем на основной раздел (обычно первая строка header'а)
    if (!header.mainSection) {
      // Паттерн: "Трубы SANEXT" или подобное
      if (/^[А-ЯЁа-яёA-Za-z\s]+SANEXT/i.test(text) || 
          /^[А-ЯЁа-яёA-Za-z\s]+$/.test(text) && text.length > 5 && text.length < 50) {
        header.mainSection = text;
        continue;
      }
    }
    
    // Проверяем на подраздел (обычно вторая строка header'а)
    if (!header.subsection) {
      // Паттерн 1: "1.3. Труба «Стабил»"
      const sectionMatch = text.match(/^(\d+(?:\.\d+){0,3})\s+(.+)$/);
      if (sectionMatch) {
        header.sectionPath = normalizeSectionPath(sectionMatch[1]);
        header.subsection = sectionMatch[2].trim();
        continue;
      }
      
      // Паттерн 2: "Труба «Стабил»" (без номера)
      const subsectionMatch = text.match(/^[А-ЯЁа-яёA-Za-z\s]+[«"']([А-ЯЁа-яёA-Za-z\s]+)[»"']/);
      if (subsectionMatch) {
        header.subsection = text;
        continue;
      }
    }
  }
  
  // Если нашли хотя бы основную информацию
  if (header.mainSection || header.subsection) {
    return header;
  }
  
  return null;
}

/**
 * Валидация границ разделов на основе header'ов страниц
 */
function validateSectionBoundariesWithHeaders(
  sections: DocumentSection[],
  pageHeaders: Map<number, PageHeader>
): {
  valid: boolean;
  corrections: Array<{
    sectionPath: string;
    pageNumber: number;
    expectedSectionPath?: string;
    message: string;
  }>;
} {
  const corrections: Array<{
    sectionPath: string;
    pageNumber: number;
    expectedSectionPath?: string;
    message: string;
  }> = [];
  
  // Проверяем каждую страницу
  for (const [pageNumber, header] of pageHeaders.entries()) {
    // Находим раздел, который должен быть на этой странице
    const expectedSection = sections.find(s => 
      s.pageStart! <= pageNumber && s.pageEnd! >= pageNumber
    );
    
    if (!expectedSection) {
      corrections.push({
        sectionPath: "unknown",
        pageNumber,
        message: `Страница ${pageNumber} не привязана ни к одному разделу`,
      });
      continue;
    }
    
    // Если header содержит sectionPath, проверяем соответствие
    if (header.sectionPath && header.sectionPath !== expectedSection.sectionPath) {
      corrections.push({
        sectionPath: expectedSection.sectionPath,
        pageNumber,
        expectedSectionPath: header.sectionPath,
        message: `Несоответствие: header указывает на раздел ${header.sectionPath}, но страница привязана к ${expectedSection.sectionPath}`,
      });
    }
    
    // Если header содержит подраздел, проверяем соответствие названию
    if (header.subsection && !expectedSection.title.includes(header.subsection)) {
      // Мягкая проверка: проверяем, содержит ли название раздела ключевые слова из header'а
      const headerKeywords = header.subsection.toLowerCase().split(/\s+/);
      const sectionTitleLower = expectedSection.title.toLowerCase();
      const hasMatchingKeywords = headerKeywords.some(keyword => 
        keyword.length > 3 && sectionTitleLower.includes(keyword)
      );
      
      if (!hasMatchingKeywords) {
        corrections.push({
          sectionPath: expectedSection.sectionPath,
          pageNumber,
          message: `Название раздела "${expectedSection.title}" не соответствует header'у "${header.subsection}"`,
        });
      }
    }
  }
  
  return {
    valid: corrections.length === 0,
    corrections,
  };
}

/**
 * Корректировка границ разделов на основе header'ов
 */
function correctSectionBoundariesWithHeaders(
  sections: DocumentSection[],
  pageHeaders: Map<number, PageHeader>
): DocumentSection[] {
  const correctedSections = [...sections];
  const sectionMap = new Map<string, DocumentSection>();
  correctedSections.forEach(s => sectionMap.set(s.sectionPath, s));
  
  // Группируем header'ы по sectionPath
  const headersBySection = new Map<string, number[]>();
  for (const [pageNumber, header] of pageHeaders.entries()) {
    if (header.sectionPath) {
      if (!headersBySection.has(header.sectionPath)) {
        headersBySection.set(header.sectionPath, []);
      }
      headersBySection.get(header.sectionPath)!.push(pageNumber);
    }
  }
  
  // Корректируем границы разделов на основе header'ов
  for (const [sectionPath, pageNumbers] of headersBySection.entries()) {
    const section = sectionMap.get(sectionPath);
    if (!section) continue;
    
    // Сортируем страницы
    const sortedPages = pageNumbers.sort((a, b) => a - b);
    const minPage = Math.min(...sortedPages);
    const maxPage = Math.max(...sortedPages);
    
    // Корректируем границы, если они отличаются
    if (section.pageStart !== minPage || section.pageEnd !== maxPage) {
      console.log(
        `[SectionCorrection] Раздел ${sectionPath}: ` +
        `было ${section.pageStart}-${section.pageEnd}, ` +
        `стало ${minPage}-${maxPage} (на основе header'ов)`
      );
      
      section.pageStart = minPage;
      section.pageEnd = maxPage;
    }
  }
  
  return correctedSections;
}
```

### 2. Исправление определения Y-координаты

**Проблема**: Используется `fontSize` вместо реальной Y-координаты.

**Решение**: Получать реальную Y-координату из `TextItem.transform[5]` (baseline).

```typescript
// В функции assemblePageTextWithFonts
function assemblePageTextWithFonts(items: Array<TextItem & { hasEOL?: boolean }>): PdfPageWithFonts {
  const lines: PdfLineWithFont[] = [];
  let currentLine: string[] = [];
  let currentLineFontSizes: number[] = [];
  let currentLineIsBold: boolean[] = [];
  let currentLineBaselines: number[] = []; // ✅ Добавить отслеживание baseline
  let lastBaseline: number | null = null;
  
  items.forEach((rawItem) => {
    const item = rawItem as TextItem & { hasEOL?: boolean };
    const transform = item.transform || [];
    const baseline = transform.length >= 6 ? transform[5] : null; // ✅ Реальная Y-координата
    
    // ... остальной код ...
    
    if (isNewLine || item.hasEOL) {
      const lineText = currentLine.join(" ");
      const avgFontSize = currentLineFontSizes.length > 0
        ? currentLineFontSizes.reduce((a, b) => a + b, 0) / currentLineFontSizes.length
        : 12;
      const avgBaseline = currentLineBaselines.length > 0
        ? currentLineBaselines.reduce((a, b) => a + b, 0) / currentLineBaselines.length
        : null; // ✅ Средняя Y-координата строки
      const lineIsBold = currentLineIsBold.filter(b => b).length > currentLineIsBold.length / 2;
      
      lines.push({ 
        text: lineText, 
        fontSize: avgFontSize, 
        isBold: lineIsBold,
        baseline: avgBaseline // ✅ Добавить baseline в структуру
      });
      
      // ... сброс буферов ...
    }
    
    currentLineBaselines.push(baseline ?? 0); // ✅ Сохранить baseline
  });
  
  // ... остальной код ...
}
```

### 2. Улучшение определения границ разделов

**Проблема**: Границы разделов определяются только по заголовкам, но не учитывается контекст.

**Решение**: Добавить дополнительные сигналы для определения конца раздела:

```typescript
interface SectionBoundarySignals {
  // Сигналы конца раздела:
  hasNextSectionHeader: boolean; // Есть заголовок следующего раздела
  hasLargeWhitespace: boolean; // Большой пробел перед следующим разделом
  hasPageBreak: boolean; // Разрыв страницы
  hasVisualSeparator: boolean; // Визуальный разделитель (линия, рамка)
  
  // Сигналы начала раздела:
  hasSectionNumber: boolean; // Есть номер раздела
  hasLargeFont: boolean; // Крупный шрифт
  hasBoldFont: boolean; // Жирный шрифт
  isAtPageTop: boolean; // В начале страницы
  isAfterLargeWhitespace: boolean; // После большого пробела
}

function detectSectionBoundaries(
  line: PdfLineWithFont,
  previousLine: PdfLineWithFont | null,
  nextLine: PdfLineWithFont | null,
  pageNumber: number,
  lineIndex: number,
  totalLines: number
): SectionBoundarySignals {
  const signals: SectionBoundarySignals = {
    hasNextSectionHeader: false,
    hasLargeWhitespace: false,
    hasPageBreak: false,
    hasVisualSeparator: false,
    hasSectionNumber: false,
    hasLargeFont: false,
    hasBoldFont: false,
    isAtPageTop: lineIndex < 3,
    isAfterLargeWhitespace: false,
  };
  
  // Проверка на заголовок раздела
  const detected = detectSectionFromLine(line.text, line.fontSize, averageFontSize, line.isBold);
  if (detected) {
    signals.hasSectionNumber = true;
    signals.hasLargeFont = line.fontSize > averageFontSize * 1.1;
    signals.hasBoldFont = line.isBold;
  }
  
  // Проверка на большой пробел перед строкой
  if (previousLine && line.baseline && previousLine.baseline) {
    const verticalGap = previousLine.baseline - line.baseline; // Разница в Y-координатах
    const averageLineHeight = averageFontSize * 1.5; // Приблизительная высота строки
    signals.hasLargeWhitespace = verticalGap > averageLineHeight * 2; // Пробел больше 2 строк
    signals.isAfterLargeWhitespace = verticalGap > averageLineHeight * 1.5;
  }
  
  // Проверка на визуальный разделитель (линия из символов)
  signals.hasVisualSeparator = /^[-=_]{3,}$/.test(line.text.trim());
  
  return signals;
}
```

### 3. Улучшение привязки элементов к разделам

**Проблема**: Элементы привязываются к разделам по приблизительной позиции в тексте.

**Решение**: Использовать реальные Y-координаты для точной привязки:

```typescript
function getSectionForElement(
  elementBaseline: number | null,
  pageNumber: number,
  sections: DocumentSection[],
  pageToSectionMap: Map<number, string>
): string | null {
  if (elementBaseline === null) {
    // Fallback: используем раздел страницы
    return pageToSectionMap.get(pageNumber) || null;
  }
  
  // Находим раздел, который активен в позиции элемента
  const pageSections = sections.filter(s => 
    s.pageStart === pageNumber || 
    (s.pageStart! < pageNumber && s.pageEnd! >= pageNumber)
  );
  
  // Сортируем по позиции начала (сверху вниз)
  const sortedSections = pageSections.sort((a, b) => {
    if (a.pageStart !== b.pageStart) {
      return a.pageStart! - b.pageStart!;
    }
    // Если на одной странице, сортируем по startY (сверху вниз)
    return (a.startY ?? 0) - (b.startY ?? 0);
  });
  
  // Находим раздел, в котором находится элемент
  for (const section of sortedSections) {
    // Если раздел начинается на этой странице
    if (section.pageStart === pageNumber && section.startY !== undefined) {
      // Элемент находится после начала раздела
      if (elementBaseline <= section.startY) {
        continue; // Элемент выше начала раздела
      }
      
      // Если раздел заканчивается на этой странице
      if (section.pageEnd === pageNumber && section.endY !== undefined) {
        // Элемент находится до конца раздела
        if (elementBaseline <= section.endY) {
          return section.sectionPath;
        }
        continue; // Элемент ниже конца раздела
      }
      
      // Раздел продолжается на следующей странице
      return section.sectionPath;
    }
    
    // Раздел начался на предыдущей странице
    if (section.pageStart! < pageNumber && section.pageEnd! >= pageNumber) {
      // Если раздел заканчивается на этой странице
      if (section.pageEnd === pageNumber && section.endY !== undefined) {
        if (elementBaseline <= section.endY) {
          return section.sectionPath;
        }
        continue;
      }
      
      // Раздел продолжается на следующей странице
      return section.sectionPath;
    }
  }
  
  // Fallback: используем раздел страницы
  return pageToSectionMap.get(pageNumber) || null;
}
```

### 4. Обработка элементов на границе разделов

**Проблема**: Элементы могут попадать в неправильный раздел, если они находятся на границе.

**Решение**: Добавить проверку позиции элемента относительно границ раздела:

```typescript
function assignElementToSection(
  element: StructuredElement,
  elementBaseline: number | null,
  sections: DocumentSection[],
  sectionMap: Map<string, DocumentSection>
): void {
  if (!elementBaseline) {
    // Fallback: используем раздел из элемента
    return;
  }
  
  const pageSections = sections.filter(s => 
    s.pageStart === element.pageNumber || 
    (s.pageStart! < element.pageNumber && s.pageEnd! >= element.pageNumber)
  );
  
  // Находим раздел, в котором находится элемент
  for (const section of pageSections) {
    const sectionInfo = sectionMap.get(section.sectionPath);
    if (!sectionInfo) continue;
    
    // Проверяем, находится ли элемент в границах раздела
    if (sectionInfo.pageStart === element.pageNumber) {
      // Раздел начинается на этой странице
      if (sectionInfo.startY !== undefined && elementBaseline < sectionInfo.startY) {
        continue; // Элемент выше начала раздела
      }
      
      if (sectionInfo.pageEnd === element.pageNumber && sectionInfo.endY !== undefined) {
        // Раздел заканчивается на этой странице
        if (elementBaseline > sectionInfo.endY) {
          continue; // Элемент ниже конца раздела
        }
      }
      
      // Элемент находится в границах раздела
      element.sectionPath = section.sectionPath;
      return;
    }
    
    // Раздел начался на предыдущей странице
    if (sectionInfo.pageStart! < element.pageNumber) {
      if (sectionInfo.pageEnd === element.pageNumber && sectionInfo.endY !== undefined) {
        // Раздел заканчивается на этой странице
        if (elementBaseline > sectionInfo.endY) {
          continue; // Элемент ниже конца раздела
        }
      }
      
      // Элемент находится в границах раздела
      element.sectionPath = section.sectionPath;
      return;
    }
  }
}
```

### 5. Улучшение создания чанков

**Проблема**: Чанки создаются по принципу "1 секция = 1 чанк", но не учитываются границы разделов внутри секции.

**Решение**: Улучшить логику создания чанков с учетом границ разделов:

```typescript
function createStructuredSectionChunks(
  structured: StructuredDocument,
  processingType: "catalog" | "instruction"
): Chunk[] {
  const chunks: Chunk[] = [];
  const sections = structured.sections ?? [];
  const elements = structured.elements ?? [];
  
  // Группируем элементы по разделам
  const elementsBySection = new Map<string, StructuredElement[]>();
  elements.forEach((element) => {
    const sectionPath = element.sectionPath || "root";
    if (!elementsBySection.has(sectionPath)) {
      elementsBySection.set(sectionPath, []);
    }
    elementsBySection.get(sectionPath)!.push(element);
  });
  
  // Создаем чанки для каждого раздела
  for (const section of sections) {
    const sectionElements = elementsBySection.get(section.sectionPath) || [];
    
    // ✅ УЛУЧШЕНИЕ: Сортируем элементы по позиции на странице
    const sortedElements = sectionElements.sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) {
        return a.pageNumber - b.pageNumber;
      }
      // Если на одной странице, сортируем по позиции (если доступно)
      // В будущем можно использовать baseline для более точной сортировки
      return 0;
    });
    
    // ✅ УЛУЧШЕНИЕ: Проверяем, не пересекаются ли элементы с границами раздела
    const validElements = sortedElements.filter(element => {
      // Проверяем, что элемент находится в границах раздела
      if (element.pageNumber < section.pageStart!) {
        return false; // Элемент на странице до начала раздела
      }
      if (section.pageEnd && element.pageNumber > section.pageEnd) {
        return false; // Элемент на странице после конца раздела
      }
      
      // Если элемент на странице начала раздела, проверяем позицию
      if (element.pageNumber === section.pageStart && section.startLineIndex !== undefined) {
        // В будущем можно использовать baseline для более точной проверки
        // Пока используем приблизительную проверку
      }
      
      // Если элемент на странице конца раздела, проверяем позицию
      if (section.pageEnd && element.pageNumber === section.pageEnd && section.endLineIndex !== undefined) {
        // В будущем можно использовать baseline для более точной проверки
      }
      
      return true;
    });
    
    // Создаем чанк из валидных элементов
    if (validElements.length > 0) {
      const chunk = createChunkFromElements(section, validElements);
      chunks.push(chunk);
    }
  }
  
  return chunks;
}
```

## Рекомендации по реализации

### Приоритет 1 (Критично)

1. **Извлечение и использование header'ов страниц** (НОВОЕ):
   - Извлекать header'ы из верхней части каждой страницы
   - Использовать header'ы для валидации границ разделов
   - Корректировать границы разделов на основе header'ов
   - Header'ы содержат точную информацию о том, к какому разделу относится страница

2. **Исправить определение Y-координаты**:
   - Получать реальную Y-координату из `TextItem.transform[5]`
   - Сохранять baseline в структуре `PdfLineWithFont`
   - Использовать baseline для определения границ разделов

3. **Улучшить привязку элементов к разделам**:
   - Использовать реальные Y-координаты элементов
   - Проверять позицию элемента относительно границ раздела
   - Обрабатывать элементы на границе разделов
   - **Использовать header страницы как fallback** для определения раздела элемента

### Приоритет 2 (Важно)

3. **Добавить дополнительные сигналы для определения границ**:
   - Большие пробелы между разделами
   - Визуальные разделители
   - Позиция на странице (начало, середина, конец)

4. **Улучшить создание чанков**:
   - Сортировать элементы по позиции на странице
   - Фильтровать элементы, выходящие за границы раздела
   - Учитывать границы разделов при создании чанков

### Приоритет 3 (Желательно)

5. **Добавить логирование для отладки**:
   - Логировать границы разделов (startY, endY)
   - Логировать привязку элементов к разделам
   - Логировать случаи, когда элементы не попадают в разделы

6. **Добавить метрики качества**:
   - Процент элементов, правильно привязанных к разделам
   - Процент разделов с правильно определенными границами
   - Процент чанков, содержащих элементы из правильных разделов

## Примеры использования

### Пример 1: Раздел занимает несколько страниц (исправлено)

```
Страница 16:
  [Header] "Трубы SANEXT" / "Труба «Стабил»" ← Header указывает на раздел 1.3
  [Содержимое] Раздел 1.3 "Труба «Стабил»"
    - Диаграмма структуры
    - Маркировка
    - Номенклатура (таблица)
    - Размеры бухт (таблица)

Страница 17:
  [Header] "Трубы SANEXT" / "Труба «Стабил»" ← Header указывает на раздел 1.3
  [Содержимое] Продолжение раздела 1.3
    - Дополнительные таблицы и информация

Страница 18:
  [Header] "Трубы SANEXT" / "Труба «Тёплый пол»" ← Header указывает на раздел 1.4
  [Содержимое] Раздел 1.4 "Труба «Тёплый пол»"
    - Описание
    - Изображение трубы
```

### Пример 2: Использование header'а для валидации

```
Сценарий: Определен раздел 1.3 на страницах 15-16

Проверка header'ов:
  Страница 15: Header отсутствует или не содержит информацию о разделе
  Страница 16: Header = "Труба «Стабил»" ✅ Соответствует разделу 1.3
  Страница 17: Header = "Труба «Стабил»" ✅ Соответствует разделу 1.3
  Страница 18: Header = "Труба «Тёплый пол»" ❌ Не соответствует разделу 1.3

Действие: Корректируем границы раздела 1.3 на страницы 16-17
```

### Пример 3: Использование header'а для привязки элементов

```
Элемент: Таблица "Размеры бухт"
  pageNumber: 16
  baseline: 500 (Y-координата)
  
Раздел 1.3:
  pageStart: 16
  pageEnd: 17
  Определен по заголовку на странице 16

Header страницы 16:
  sectionPath: "1.3"
  subsection: "Труба «Стабил»"
  
Проверка:
  1. Элемент на странице 16 ✅
  2. Header страницы указывает на раздел 1.3 ✅
  3. Раздел 1.3 включает страницу 16 ✅
  
Результат: Элемент правильно привязан к разделу 1.3
```

## Заключение

Текущая реализация имеет хорошую основу для определения границ разделов, но нуждается в улучшениях:

1. **Использование header'ов страниц** (НОВОЕ - КРИТИЧЕСКИ ВАЖНО):
   - Header'ы содержат точную информацию о разделе каждой страницы
   - Могут использоваться для валидации и корректировки границ разделов
   - Повышают надежность определения границ разделов

2. **Точность**: Использование реальных Y-координат вместо размера шрифта
3. **Надежность**: Улучшение привязки элементов к разделам с использованием header'ов
4. **Обработка границ**: Корректная обработка элементов на границе разделов

### Ключевые выводы из анализа документа:

- **Разделы занимают целые страницы**: Раздел 1.3 занимает страницы 16-17, раздел 1.4 начинается со страницы 18
- **Header'ы страниц - важный источник информации**: Каждая страница содержит header с указанием раздела и подраздела
- **Header'ы можно использовать для валидации**: Если header указывает на другой раздел, чем определенный по заголовку - это сигнал для корректировки

Реализация предложенных улучшений, особенно использование header'ов страниц, значительно повысит точность определения границ разделов и качество создания чанков.

