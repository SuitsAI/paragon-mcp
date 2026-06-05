import {
  decodeBase64UrlToBuffer,
  extractFileContent,
} from "./fileContentExtractor";
import { ExtendedTool } from "./type";
import { performProxyApiRequest, unwrapProxyResponse } from "./utils";

export type GmailGetAttachmentContentArgs = {
  messageId: string;
  attachmentId: string;
  userId?: string;
  mimeType?: string;
  filename?: string;
  showAll?: boolean;
};

export function createGmailGetAttachmentContentTool(): ExtendedTool {
  return {
    name: "GMAIL_GET_ATTACHMENT_CONTENT",
    description:
      "Get decoded text content from a Gmail file attachment. Supports CSV, TXT, HTML, PDF, and DOCX (up to 5000 characters). Pass mimeType and filename from the message part when available. Use GMAIL_GET_EMAIL_BY_ID with showAll first to find attachmentId, mimeType, and filename.",
    integrationName: "gmail",
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
            "The attachment ID from the message part (payload.parts[].body.attachmentId).",
        },
        mimeType: {
          type: "string",
          description:
            "MIME type from the message part (payload.parts[].mimeType), e.g. application/pdf.",
        },
        filename: {
          type: "string",
          description:
            "Filename from the message part (payload.parts[].filename), e.g. report.pdf.",
        },
        userId: {
          type: "string",
          description:
            'The user\'s email address. Defaults to "me" for the authenticated user.',
        },
        showAll: {
          type: "boolean",
          description:
            "Use true only if user asks for the full raw attachment API response. Default is false.",
          default: false,
        },
      },
      required: ["messageId", "attachmentId"],
      additionalProperties: false,
    },
  };
}

export async function performGmailGetAttachmentContent(
  args: GmailGetAttachmentContentArgs,
  jwt: string,
  credentialId: string | null
): Promise<any> {
  const userId = args.userId || "me";
  const rawResponse = await performProxyApiRequest(
    {
      integration: "gmail",
      url: `/gmail/v1/users/${userId}/messages/${args.messageId}/attachments/${args.attachmentId}`,
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
      `Gmail attachment request failed with status ${envelope.status}`
    );
  }

  const attachment = unwrapProxyResponse(envelope) as {
    size?: number;
    data?: string;
    attachmentId?: string;
  };

  if (args.showAll) {
    return attachment;
  }

  if (!attachment?.data) {
    return attachment;
  }

  const buffer = decodeBase64UrlToBuffer(attachment.data);
  const extracted = await extractFileContent(buffer, {
    mimeType: args.mimeType,
    filename: args.filename,
  });

  return {
    attachmentId: args.attachmentId,
    size: attachment.size ?? null,
    mimeType: args.mimeType ?? null,
    filename: args.filename ?? null,
    ...extracted,
  };
}
