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
      "Get decoded text content from an Outlook file attachment. Supports CSV, TXT, HTML, PDF, and DOCX (up to 5000 characters). Pass mimeType and filename from the attachments list on OUTLOOK_GET_MESSAGES.",
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

function parseProxyEnvelope(rawResponse: unknown): any {
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
    return null;
  }

  return unwrapProxyResponse(envelope);
}

export async function fetchOutlookMessageAttachments(
  messageId: string,
  jwt: string,
  credentialId: string | null
): Promise<any[]> {
  try {
    const rawResponse = await performProxyApiRequest(
      {
        integration: "outlook",
        url: `/v1.0/me/messages/${messageId}/attachments`,
        httpMethod: "GET",
      },
      jwt,
      credentialId
    );

    const body = parseProxyEnvelope(rawResponse);
    if (!body) {
      return [];
    }

    const attachments = Array.isArray(body?.value)
      ? body.value
      : Array.isArray(body)
        ? body
        : [];

    return attachments.map((attachment: any) => {
      const { contentBytes: _contentBytes, ...metadata } = attachment;
      return metadata;
    });
  } catch {
    return [];
  }
}

async function enrichOutlookMessage(
  message: any,
  jwt: string,
  credentialId: string | null
): Promise<any> {
  if (!message?.id || !message?.hasAttachments) {
    return message;
  }

  if (Array.isArray(message.attachments) && message.attachments.length > 0) {
    return message;
  }

  const attachments = await fetchOutlookMessageAttachments(
    message.id,
    jwt,
    credentialId
  );

  return {
    ...message,
    attachments,
  };
}

export async function enrichOutlookMessagesWithAttachments(
  response: any,
  jwt: string,
  credentialId: string | null
): Promise<any> {
  if (!response) {
    return response;
  }

  if (Array.isArray(response)) {
    return Promise.all(
      response.map((message) =>
        enrichOutlookMessage(message, jwt, credentialId)
      )
    );
  }

  if (typeof response === "object" && Array.isArray(response.value)) {
    return {
      ...response,
      value: await Promise.all(
        response.value.map((message: any) =>
          enrichOutlookMessage(message, jwt, credentialId)
        )
      ),
    };
  }

  if (response.id) {
    return enrichOutlookMessage(response, jwt, credentialId);
  }

  return response;
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

  const attachment = parseProxyEnvelope(rawResponse);
  if (!attachment) {
    throw new Error("Outlook attachment request failed");
  }

  const fileAttachment = attachment as {
    id?: string;
    name?: string;
    contentType?: string;
    size?: number;
    contentBytes?: string;
    "@odata.type"?: string;
  };

  if (args.showAll) {
    return fileAttachment;
  }

  if (!fileAttachment.contentBytes) {
    return {
      attachmentId: args.attachmentId,
      size: fileAttachment.size ?? null,
      mimeType: args.mimeType ?? fileAttachment.contentType ?? null,
      filename: args.filename ?? fileAttachment.name ?? null,
      content: null,
      fileType: "unsupported",
      truncated: false,
      contentLength: 0,
      error:
        fileAttachment["@odata.type"] === "#microsoft.graph.referenceAttachment"
          ? "Reference attachments are links to cloud files and cannot be decoded as text. Use showAll for metadata."
          : "Attachment has no contentBytes. It may be an item or reference attachment.",
    };
  }

  const buffer = decodeBase64ToBuffer(fileAttachment.contentBytes);
  const extracted = await extractFileContent(buffer, {
    mimeType: args.mimeType ?? fileAttachment.contentType,
    filename: args.filename ?? fileAttachment.name,
  });

  return {
    attachmentId: args.attachmentId,
    size: fileAttachment.size ?? null,
    mimeType: args.mimeType ?? fileAttachment.contentType ?? null,
    filename: args.filename ?? fileAttachment.name ?? null,
    ...extracted,
  };
}
