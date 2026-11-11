import {
  decodeBase64ToBuffer,
  extractFileContent,
} from "./fileContentExtractor";
import { getSharePointDownloadShowAllDescription } from "./showAllDescription";
import { ExtendedTool } from "./type";
import { performProxyApiRequest, unwrapProxyResponse } from "./utils";

export const SHAREPOINT_DOWNLOAD_FILE_CONTENT_SIMPLIFIED_PROPERTIES = [
  "itemId",
  "size",
  "mimeType",
  "filename",
  "content",
  "fileType",
  "truncated",
  "contentLength",
  "error",
] as const;

export type SharepointDownloadFileContentArgs = {
  itemId: string;
  siteId?: string;
  driveId?: string;
  itemPath?: string;
  mimeType?: string;
  filename?: string;
  showAll?: boolean;
};

export function createSharePointDownloadFileContentTool(): ExtendedTool {
  return {
    name: "SHAREPOINT_DOWNLOAD_FILE_CONTENT",
    description:
      "Get decoded text content from a SharePoint/OneDrive drive file (document library item). Supports CSV, TXT, HTML, PDF, and DOCX (up to 5000 characters). Provide either driveId+itemId, or siteId+itemId (the site's default document library is used), or siteId+itemPath. Do not use CALL_API_REQUEST to fetch raw file bytes from a SharePoint drive /content endpoint — binary files get corrupted when read as text; use this tool instead.",
    integrationName: "sharepoint",
    requiredFields: ["itemId"],
    isOpenApiTool: false,
    isCustomTool: true,
    inputSchema: {
      type: "object",
      properties: {
        itemId: {
          type: "string",
          description:
            "The drive item ID of the file. Required unless itemPath is used with siteId.",
        },
        siteId: {
          type: "string",
          description:
            "The SharePoint site ID that owns the file. Use with itemId (default document library) or with itemPath.",
        },
        driveId: {
          type: "string",
          description:
            "The drive ID that owns the file, when known directly (takes precedence over siteId).",
        },
        itemPath: {
          type: "string",
          description:
            "Path to the file relative to the drive root (e.g. 'Shared Documents/report.pdf'). Use instead of itemId, together with siteId or driveId.",
        },
        mimeType: {
          type: "string",
          description:
            "MIME type hint for the file, e.g. application/pdf. Improves extraction when the file has no extension.",
        },
        filename: {
          type: "string",
          description: "Filename hint, e.g. report.pdf.",
        },
        showAll: {
          type: "boolean",
          description: getSharePointDownloadShowAllDescription(
            SHAREPOINT_DOWNLOAD_FILE_CONTENT_SIMPLIFIED_PROPERTIES.join(", ")
          ),
          default: false,
        },
      },
      required: ["itemId"],
      additionalProperties: false,
    },
  };
}

function graphUrl(path: string): string {
  return `https://graph.microsoft.com/v1.0${path}`;
}

function buildMetadataUrl(args: SharepointDownloadFileContentArgs): string {
  const base = args.driveId
    ? `/drives/${args.driveId}`
    : args.siteId
      ? `/sites/${args.siteId}/drive`
      : null;

  if (!base) {
    throw new Error(
      "Either driveId or siteId must be provided to locate the SharePoint drive."
    );
  }

  if (args.itemPath) {
    const normalizedPath = args.itemPath.replace(/^\/+/, "");
    return graphUrl(`${base}/root:/${encodeURI(normalizedPath)}`);
  }

  return graphUrl(`${base}/items/${args.itemId}`);
}

function isDriveItemResponse(value: any): boolean {
  return (
    value &&
    typeof value === "object" &&
    "id" in value &&
    ("name" in value ||
      "file" in value ||
      "@microsoft.graph.downloadUrl" in value)
  );
}

function parseProxyEnvelope(rawResponse: unknown): any {
  let envelope: any;
  try {
    envelope =
      typeof rawResponse === "string" ? JSON.parse(rawResponse) : rawResponse;
  } catch {
    envelope = rawResponse;
  }

  if (isDriveItemResponse(envelope)) {
    return envelope;
  }

  if (
    envelope &&
    typeof envelope === "object" &&
    "status" in envelope &&
    envelope.status !== 200
  ) {
    return null;
  }

  const unwrapped = unwrapProxyResponse(envelope);
  return isDriveItemResponse(unwrapped) ? unwrapped : null;
}

export async function performSharePointDownloadFileContent(
  args: SharepointDownloadFileContentArgs,
  jwt: string,
  credentialId: string | null
): Promise<any> {
  const metadataUrl = buildMetadataUrl(args);

  const rawResponse = await performProxyApiRequest(
    {
      integration: "sharepoint",
      url: metadataUrl,
      httpMethod: "GET",
      skipSanitization: true,
    },
    jwt,
    credentialId
  );

  const item = parseProxyEnvelope(rawResponse);
  if (!item) {
    throw new Error("SharePoint item metadata request failed");
  }

  const driveItem = item as {
    id?: string;
    name?: string;
    size?: number;
    file?: { mimeType?: string };
    folder?: unknown;
    "@microsoft.graph.downloadUrl"?: string;
  };

  if (args.showAll) {
    return driveItem;
  }

  if (driveItem.folder) {
    return {
      itemId: driveItem.id ?? args.itemId,
      size: driveItem.size ?? null,
      mimeType: null,
      filename: driveItem.name ?? args.filename ?? null,
      content: null,
      fileType: "unsupported",
      truncated: false,
      contentLength: 0,
      error: "This item is a folder, not a downloadable file.",
    };
  }

  const downloadUrl = driveItem["@microsoft.graph.downloadUrl"];
  if (!downloadUrl) {
    return {
      itemId: driveItem.id ?? args.itemId,
      size: driveItem.size ?? null,
      mimeType: driveItem.file?.mimeType ?? args.mimeType ?? null,
      filename: driveItem.name ?? args.filename ?? null,
      content: null,
      fileType: "unsupported",
      truncated: false,
      contentLength: 0,
      error:
        "Item metadata has no downloadUrl. It may not be a regular file, or the proxy response omitted @microsoft.graph.downloadUrl. Use showAll for raw metadata.",
    };
  }

  // The download URL is a pre-authenticated, time-limited link straight to
  // the file bytes. Fetch it directly (not through the Paragon proxy) so the
  // binary content is never coerced through a text decode, which corrupts
  // PDFs/DOCX/etc.
  const fileResponse = await fetch(downloadUrl);
  if (!fileResponse.ok) {
    throw new Error(
      `Failed to download SharePoint file content; status: ${fileResponse.status}`
    );
  }
  const buffer = Buffer.from(await fileResponse.arrayBuffer());

  const extracted = await extractFileContent(buffer, {
    mimeType: driveItem.file?.mimeType ?? args.mimeType,
    filename: driveItem.name ?? args.filename,
  });

  return {
    itemId: driveItem.id ?? args.itemId,
    size: driveItem.size ?? null,
    mimeType: driveItem.file?.mimeType ?? args.mimeType ?? null,
    filename: driveItem.name ?? args.filename ?? null,
    ...extracted,
  };
}

// Re-exported for parity with the other attachment-content tools, in case a
// caller already has base64 bytes on hand (e.g. from a different Graph call).
export { decodeBase64ToBuffer };
