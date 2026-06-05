import {
  decodeBase64ToBuffer,
  extractFileContent,
} from "./fileContentExtractor";
import { ExtendedTool } from "./type";
import { performProxyApiRequest, unwrapProxyResponse } from "./utils";

export const OUTLOOK_ATTACHMENT_CONTENT_SIMPLIFIED_PROPERTIES = [
  "attachmentId",
  "size",
  "mimeType",
  "filename",
  "content",
  "fileType",
  "truncated",
  "contentLength",
  "error",
] as const;

export type OutlookGetAttachmentContentArgs = {
  messageId: string;
  attachmentId: string;
  mimeType?: string;
  filename?: string;
  showAll?: boolean;
};

export function createOutlookGetAttachmentContentTool(): ExtendedTool {
  return {
    name: "OUTLOOK_GET_ATTACHMENT_CONTENT",
    description:
      "Get decoded text content from an Outlook file attachment. Supports CSV, TXT, HTML, PDF, and DOCX (up to 5000 characters). Pass mimeType and filename when available. Use OUTLOOK_GET_MESSAGES with showAll first to find messageId and attachment metadata.",
    integrationName: "outlook",
    requiredFields: ["messageId", "attachmentId"],
    isOpenApiTool: false,
    isCustomTool: true,
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The ID of the message containing the attachment.",
        },
        attachmentId: {
          type: "string",
          description:
            "The attachment ID from the message attachments list.",
        },
        mimeType: {
          type: "string",
          description:
            "MIME type from the attachment (contentType), e.g. application/pdf.",
        },
        filename: {
          type: "string",
          description:
            "Filename from the attachment (name), e.g. report.pdf.",
        },
        showAll: {
          type: "boolean",
          description: `Default is false. When false, returns simplified properties: ${OUTLOOK_ATTACHMENT_CONTENT_SIMPLIFIED_PROPERTIES.join(", ")}. When true, returns the raw Microsoft Graph attachment response (contentBytes, metadata). Do not use in a loop.`,
          default: false,
        },
      },
      required: ["messageId", "attachmentId"],
      additionalProperties: false,
    },
  };
}

export async function performOutlookGetAttachmentContent(
  args: OutlookGetAttachmentContentArgs,
  jwt: string,
  credentialId: string | null
): Promise<any> {
  const rawResponse = await performProxyApiRequest(
    {
      integration: "outlook",
      url: `/v1.0/me/messages/${args.messageId}/attachments/${args.attachmentId}`,
      httpMethod: "GET",
    },
    jwt,
    credentialId
  );

  let envelope: any;
  try {
    envelope =
      typeof rawResponse === "string" ? JSON.parse(rawResponse) : rawResponse;
  } catch {
    envelope = rawResponse;
  }

  if (
    envelope &&
    typeof envelope === "object" &&
    "status" in envelope &&
    envelope.status !== 200
  ) {
    throw new Error(
      `Outlook attachment request failed with status ${envelope.status}`
    );
  }

  const attachment = unwrapProxyResponse(envelope) as {
    id?: string;
    name?: string;
    contentType?: string;
    size?: number;
    contentBytes?: string;
    "@odata.type"?: string;
  };

  if (args.showAll) {
    return attachment;
  }

  if (!attachment?.contentBytes) {
    return {
      attachmentId: args.attachmentId,
      size: attachment?.size ?? null,
      mimeType: args.mimeType ?? attachment?.contentType ?? null,
      filename: args.filename ?? attachment?.name ?? null,
      content: null,
      fileType: "unsupported",
      truncated: false,
      contentLength: 0,
      error:
        attachment?.["@odata.type"] === "#microsoft.graph.referenceAttachment"
          ? "Reference attachments are links to cloud files and cannot be decoded as text. Use showAll for metadata."
          : "Attachment has no contentBytes. It may be an item or reference attachment.",
    };
  }

  const buffer = decodeBase64ToBuffer(attachment.contentBytes);
  const extracted = await extractFileContent(buffer, {
    mimeType: args.mimeType ?? attachment.contentType,
    filename: args.filename ?? attachment.name,
  });

  return {
    attachmentId: args.attachmentId,
    size: attachment.size ?? null,
    mimeType: args.mimeType ?? attachment.contentType ?? null,
    filename: args.filename ?? attachment.name ?? null,
    ...extracted,
  };
}
