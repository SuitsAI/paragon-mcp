import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const MAX_CONTENT_LENGTH = 5000;

const SUPPORTED_FORMATS = ["csv", "txt", "html", "pdf", "docx", "json"] as const;
type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];

export function decodeBase64UrlToBuffer(data: string): Buffer {
  const base64Data = data.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64Data.length % 4;
  const paddedData = padding ? base64Data + "=".repeat(4 - padding) : base64Data;
  return Buffer.from(paddedData, "base64");
}

function truncateContent(text: string, maxLength: number = MAX_CONTENT_LENGTH) {
  const contentLength = text.length;
  if (contentLength <= maxLength) {
    return { content: text, truncated: false, contentLength };
  }
  return {
    content: text.slice(0, maxLength),
    truncated: true,
    contentLength,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function getExtension(filename?: string): string | undefined {
  if (!filename) return undefined;
  const parts = filename.split(".");
  if (parts.length < 2) return undefined;
  return parts.at(-1)?.toLowerCase();
}

function detectFileType(
  buffer: Buffer,
  mimeType?: string,
  filename?: string
): SupportedFormat | "unsupported" {
  const ext = getExtension(filename);
  const mime = mimeType?.toLowerCase() ?? "";

  if (mime.includes("pdf") || ext === "pdf" || buffer.subarray(0, 4).toString() === "%PDF") {
    return "pdf";
  }

  if (
    mime.includes("wordprocessingml") ||
    mime.includes("msword") ||
    ext === "docx" ||
    ext === "doc"
  ) {
    return "docx";
  }

  if (mime.includes("csv") || ext === "csv") {
    return "csv";
  }

  if (mime.includes("html") || ext === "html" || ext === "htm") {
    return "html";
  }

  if (mime.includes("json") || ext === "json") {
    return "json";
  }

  if (
    mime.startsWith("text/") ||
    ext === "txt" ||
    ext === "md" ||
    ext === "log"
  ) {
    return "txt";
  }

  if (isMostlyText(buffer)) {
    return "txt";
  }

  return "unsupported";
}

function isMostlyText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (sample.length === 0) return true;

  let nonPrintable = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13) continue;
    if (byte < 32 || byte === 127) nonPrintable++;
  }

  return nonPrintable / sample.length < 0.1;
}

function decodeTextBuffer(buffer: Buffer): string {
  return buffer.toString("utf-8").replace(/^\uFEFF/, "");
}

async function extractByType(
  buffer: Buffer,
  fileType: SupportedFormat
): Promise<string> {
  switch (fileType) {
    case "pdf": {
      const parser = new PDFParse({ data: buffer });
      try {
        const parsed = await parser.getText();
        return parsed.text.replace(/\s+/g, " ").trim();
      } finally {
        await parser.destroy();
      }
    }
    case "docx": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.replace(/\s+/g, " ").trim();
    }
    case "html": {
      return stripHtml(decodeTextBuffer(buffer));
    }
    case "csv":
    case "json":
    case "txt":
      return decodeTextBuffer(buffer);
  }
}

export async function extractFileContent(
  buffer: Buffer,
  options: { mimeType?: string; filename?: string } = {}
): Promise<{
  content: string | null;
  fileType: string;
  truncated: boolean;
  contentLength: number;
  error?: string;
}> {
  const fileType = detectFileType(buffer, options.mimeType, options.filename);

  if (fileType === "unsupported") {
    return {
      content: null,
      fileType: "unsupported",
      truncated: false,
      contentLength: 0,
      error: `Unsupported file type for text extraction. Provide mimeType/filename from the message part, or use showAll for raw data. Supported: ${SUPPORTED_FORMATS.join(", ")}.`,
    };
  }

  try {
    const text = await extractByType(buffer, fileType);
    const { content, truncated, contentLength } = truncateContent(text);

    return {
      content,
      fileType,
      truncated,
      contentLength,
    };
  } catch (error) {
    return {
      content: null,
      fileType,
      truncated: false,
      contentLength: 0,
      error:
        error instanceof Error
          ? `Failed to extract ${fileType} content: ${error.message}`
          : `Failed to extract ${fileType} content.`,
    };
  }
}
