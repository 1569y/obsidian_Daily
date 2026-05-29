const DEFAULT_DAYNEST_SECTION_HEADING = "## DayNest";

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function getHeadingLevel(heading: string): number {
  const match = heading.match(/^(#+)\s+/);
  const hashes = match?.[1];
  return hashes ? hashes.length : 2;
}

function findHeadingLineIndex(lines: string[], heading: string): number {
  return lines.findIndex((line) => line.trim() === heading);
}

function findSectionEndLineIndex(
  lines: string[],
  startIndex: number,
  headingLevel: number
): number {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (typeof line !== "string") {
      continue;
    }

    const trimmed = line.trim();
    const match = trimmed.match(/^(#+)\s+/);
    const hashes = match?.[1];

    if (hashes && hashes.length <= headingLevel) {
      return index;
    }
  }

  return lines.length;
}

function trimTrailingBlankLines(lines: string[]): string[] {
  const result = [...lines];

  while (result.length > 0) {
    const lastLine = result[result.length - 1];
    if (typeof lastLine !== "string" || lastLine.trim() !== "") {
      break;
    }

    result.pop();
  }

  return result;
}

export function normalizeDayNestSectionHeading(heading: string): string {
  const normalized = heading.trim();
  return normalized || DEFAULT_DAYNEST_SECTION_HEADING;
}

export function hasDayNestSection(markdown: string, heading: string): boolean {
  const normalizedHeading = normalizeDayNestSectionHeading(heading);
  const lines = normalizeLineEndings(markdown).split("\n");

  return findHeadingLineIndex(lines, normalizedHeading) >= 0;
}

export function ensureDayNestSection(markdown: string, heading: string): string {
  const normalizedHeading = normalizeDayNestSectionHeading(heading);
  const normalizedMarkdown = normalizeLineEndings(markdown);

  if (hasDayNestSection(normalizedMarkdown, normalizedHeading)) {
    return normalizedMarkdown;
  }

  const trimmedLines = trimTrailingBlankLines(normalizedMarkdown.split("\n"));
  const nextLines =
    trimmedLines.length === 0
      ? [normalizedHeading, ""]
      : [...trimmedLines, "", normalizedHeading, ""];

  return nextLines.join("\n");
}

export function buildDayNestAppendBlock(
  content: string,
  createdAt?: string
): string {
  const normalizedContent = normalizeLineEndings(content).trim();
  const lines = ["### DayNest Entry"];

  if (typeof createdAt === "string" && createdAt.trim().length > 0) {
    lines.push(`- createdAt: ${createdAt.trim()}`);
  }

  if (normalizedContent.length > 0) {
    lines.push(normalizedContent);
  }

  return `${lines.join("\n")}\n`;
}

export function appendToDayNestSection(
  markdown: string,
  heading: string,
  contentToAppend: string
): string {
  const normalizedHeading = normalizeDayNestSectionHeading(heading);
  const normalizedMarkdown = ensureDayNestSection(markdown, normalizedHeading);
  const normalizedContent = normalizeLineEndings(contentToAppend).trim();

  if (normalizedContent.length === 0) {
    return normalizedMarkdown;
  }

  const lines = normalizeLineEndings(normalizedMarkdown).split("\n");
  const headingIndex = findHeadingLineIndex(lines, normalizedHeading);

  if (headingIndex < 0) {
    return normalizedMarkdown;
  }

  const sectionEndIndex = findSectionEndLineIndex(
    lines,
    headingIndex,
    getHeadingLevel(normalizedHeading)
  );
  const sectionLines = lines.slice(headingIndex + 1, sectionEndIndex);
  const trimmedSectionLines = trimTrailingBlankLines(sectionLines);
  const prefix = lines.slice(0, headingIndex + 1);
  const suffix = lines.slice(sectionEndIndex);
  const nextSectionLines =
    trimmedSectionLines.length === 0
      ? ["", normalizedContent, ""]
      : [...trimmedSectionLines, "", normalizedContent, ""];

  return [...prefix, ...nextSectionLines, ...suffix].join("\n");
}
