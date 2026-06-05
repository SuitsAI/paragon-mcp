// Helper function to decode base64url data
function decodeBase64Url(data: string): string {
    const base64Data = data.replace(/-/g, '+').replace(/_/g, '/');
    const padding = base64Data.length % 4;
    const paddedData = padding ? base64Data + '='.repeat(4 - padding) : base64Data;
    return Buffer.from(paddedData, 'base64').toString('utf-8');
}

// Helper function to strip HTML and extract clean text
function stripHtml(html: string): string {
    return html
        // Remove style tags and their content
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        // Remove script tags and their content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        // Remove head tags and their content
        .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
        // Convert common block elements to newlines
        .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<hr\s*\/?>/gi, '\n---\n')
        // Remove all remaining HTML tags
        .replace(/<[^>]+>/g, '')
        // Decode common HTML entities
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&rsquo;/gi, "'")
        .replace(/&lsquo;/gi, "'")
        .replace(/&rdquo;/gi, '"')
        .replace(/&ldquo;/gi, '"')
        .replace(/&mdash;/gi, '—')
        .replace(/&ndash;/gi, '–')
        .replace(/&#\d+;/gi, '') // Remove other numeric entities
        // Clean up whitespace
        .replace(/\t/g, ' ')
        .replace(/ +/g, ' ')
        .replace(/\n /g, '\n')
        .replace(/ \n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// Helper function to remove forwarded message content
function removeForwardedContent(text: string): string {
    // Common forwarded message patterns (case insensitive)
    const forwardPatterns = [
        // Gmail style
        /---------- Forwarded message ---------[\s\S]*/i,
        // Outlook style
        /-----Original Message-----[\s\S]*/i,
        // Generic forward markers
        /_{5,}[\s\S]*?From:[\s\S]*/i,
        /-{5,}[\s\S]*?From:[\s\S]*/i,
        // "Begin forwarded message" style
        /Begin forwarded message:[\s\S]*/i,
        // "Forwarded by" style
        /-{3,}\s*Forwarded by[\s\S]*/i,
    ];

    let result = text;
    for (const pattern of forwardPatterns) {
        result = result.replace(pattern, '');
    }

    // Also remove quoted reply content (lines starting with >)
    const lines = result.split('\n');
    const filteredLines: string[] = [];
    let inQuotedBlock = false;
    
    for (const line of lines) {
        const trimmedLine = line.trim();
        // Check if line starts with > (quoted content)
        if (trimmedLine.startsWith('>')) {
            inQuotedBlock = true;
            continue;
        }
        // Check for "On ... wrote:" pattern that precedes quoted content
        if (/^On .+ wrote:$/i.test(trimmedLine)) {
            inQuotedBlock = true;
            continue;
        }
        // Reset quoted block flag if we hit a non-empty, non-quoted line
        if (trimmedLine && inQuotedBlock) {
            inQuotedBlock = false;
        }
        if (!inQuotedBlock) {
            filteredLines.push(line);
        }
    }

    return filteredLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const MAX_CONTENT_LENGTH = 5000;

export const GMAIL_EMAIL_BY_ID_SIMPLIFIED_PROPERTIES = [
    "id",
    "threadId",
    "labelIds",
    "snippet",
    "subject",
    "sender",
    "receiver",
    "date",
    "attachments",
    "hasAttachments",
    "data",
    "truncated",
    "contentLength",
    "availableProperties",
    "attachmentItemProperties",
] as const;

export const GMAIL_ATTACHMENT_ITEM_PROPERTIES = [
    "attachmentId",
    "filename",
    "mimeType",
    "size",
    "partId",
] as const;

export const OUTLOOK_MESSAGE_SIMPLIFIED_PROPERTIES = [
    "id",
    "threadId",
    "snippet",
    "subject",
    "sender",
    "receiver",
    "cc",
    "bcc",
    "attachments",
    "hasAttachments",
    "hasAttachment",
    "date",
    "data",
] as const;

function withSimplifiedResponseMeta(
    result: Record<string, unknown>,
    properties: readonly string[],
    nested?: Record<string, readonly string[]>
) {
    result.availableProperties = [...properties];
    if (nested) {
        for (const [key, value] of Object.entries(nested)) {
            result[key] = [...value];
        }
    }
    return result;
}

function truncateContent(text: string, maxLength: number = MAX_CONTENT_LENGTH): {
    content: string;
    truncated: boolean;
    contentLength: number;
} {
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

// Helper function to clean email body text
function cleanEmailBody(rawData: string, isHtml: boolean): string {
    let text = rawData;
    
    // Strip HTML if needed
    if (isHtml || /<[^>]+>/.test(text)) {
        text = stripHtml(text);
    }
    
    // Remove forwarded content
    text = removeForwardedContent(text);
    
    // Collapse all newlines and excessive whitespace into single spaces
    text = text
        .replace(/\r\n/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/\r/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    return text;
}

type GmailAttachment = {
    attachmentId: string;
    filename: string | null;
    mimeType: string;
    size: number | null;
    partId: string | null;
};

function collectGmailAttachments(part: any): GmailAttachment[] {
    const attachments: GmailAttachment[] = [];

    function walk(messagePart: any) {
        if (!messagePart || typeof messagePart !== "object") {
            return;
        }

        if (messagePart.body?.attachmentId) {
            attachments.push({
                attachmentId: messagePart.body.attachmentId,
                filename: messagePart.filename ?? null,
                mimeType: messagePart.mimeType ?? "application/octet-stream",
                size: messagePart.body.size ?? null,
                partId: messagePart.partId ?? null,
            });
        }

        if (Array.isArray(messagePart.parts)) {
            for (const childPart of messagePart.parts) {
                walk(childPart);
            }
        }
    }

    walk(part);
    return attachments;
}

type OutlookAttachment = {
    attachmentId: string;
    filename: string | null;
    mimeType: string;
    size: number | null;
};

function collectOutlookAttachments(message: any): OutlookAttachment[] {
    if (!Array.isArray(message.attachments)) {
        return [];
    }

    return message.attachments
        .filter((attachment: any) => attachment?.id)
        .map((attachment: any) => ({
            attachmentId: attachment.id,
            filename: attachment.name ?? null,
            mimeType: attachment.contentType ?? "application/octet-stream",
            size: attachment.size ?? null,
        }));
}

function formatEmailAddress(recipient: {
    emailAddress?: { name?: string; address?: string };
}): string {
    const { name, address } = recipient?.emailAddress ?? {};
    if (name && address) {
        return `${name} <${address}>`;
    }
    return address ?? name ?? "";
}

function sanitizeOutlookMessage(message: any): any {
    if (!message || typeof message !== "object") {
        return message;
    }

    const result: any = {
        id: message.id,
        threadId: message.conversationId,
        snippet: message.bodyPreview,
    };

    if (message.subject) {
        result.subject = message.subject;
    }

    if (message.sender?.emailAddress) {
        result.sender = formatEmailAddress(message.sender);
    } else if (message.from?.emailAddress) {
        result.sender = formatEmailAddress(message.from);
    }

    const toRecipients: string[] = [];
    if (Array.isArray(message.toRecipients)) {
        toRecipients.push(
            ...message.toRecipients.map(formatEmailAddress).filter(Boolean)
        );
    }
    if (toRecipients.length > 0) {
        result.receiver = toRecipients.join(", ");
    }

    const ccRecipients: string[] = [];
    if (Array.isArray(message.ccRecipients)) {
        ccRecipients.push(
            ...message.ccRecipients.map(formatEmailAddress).filter(Boolean)
        );
    }
    if (ccRecipients.length > 0) {
        result.cc = ccRecipients.join(", ");
    }

    const bccRecipients: string[] = [];
    if (Array.isArray(message.bccRecipients)) {
        bccRecipients.push(
            ...message.bccRecipients.map(formatEmailAddress).filter(Boolean)
        );
    }
    if (bccRecipients.length > 0) {
        result.bcc = bccRecipients.join(", ");
    }

    const attachments = collectOutlookAttachments(message);
    result.attachments = attachments;
    result.hasAttachments =
        message.hasAttachments ?? attachments.length > 0;
    if (message.hasAttachments !== undefined) {
        result.hasAttachment = message.hasAttachments;
    }

    if (message.receivedDateTime) {
        result.date = message.receivedDateTime;
    } else if (message.sentDateTime) {
        result.date = message.sentDateTime;
    }

    if (message.body?.content) {
        const isHtml =
            message.body.contentType?.toLowerCase() === "html" ||
            /<[^>]+>/.test(message.body.content);
        result.data = cleanEmailBody(message.body.content, isHtml);
    } else if (message.bodyPreview) {
        result.data = cleanEmailBody(message.bodyPreview, false);
    }

    return result;
}

export default {
    "GMAIL_GET_EMAIL_BY_ID": function(response: any): any {
        if (!response || typeof response !== 'object') {
            return response;
        }

        // Extract top-level fields
        const result: any = {
            id: response.id,
            threadId: response.threadId,
            labelIds: response.labelIds,
            snippet: response.snippet,
        };

        // Extract headers if payload exists
        if (response.payload && response.payload.headers) {
            const headers = response.payload.headers;
            
            // Find subject
            const subjectHeader = headers.find((h: any) => h.name === "Subject");
            if (subjectHeader) {
                result.subject = subjectHeader.value;
            }

            // Find sender (From)
            const fromHeader = headers.find((h: any) => h.name === "From");
            if (fromHeader) {
                result.sender = fromHeader.value;
            }

            // Find receivers (To and Cc)
            const toHeader = headers.find((h: any) => h.name === "To");
            const ccHeader = headers.find((h: any) => h.name === "Cc");
            const receivers: string[] = [];
            if (toHeader) {
                receivers.push(toHeader.value);
            }
            if (ccHeader) {
                receivers.push(ccHeader.value);
            }
            if (receivers.length > 0) {
                result.receiver = receivers.join(", ");
            }

            // Find date
            const dateHeader = headers.find((h: any) => h.name === "Date");
            if (dateHeader) {
                result.date = dateHeader.value;
            }
        }

        if (response.payload) {
            const attachments = collectGmailAttachments(response.payload);
            result.attachments = attachments;
            result.hasAttachments = attachments.length > 0;
        }

        // Extract body data from parts
        if (response.payload && response.payload.parts && Array.isArray(response.payload.parts)) {
            // Try to find text/plain first, then text/html
            let textPart = response.payload.parts.find((part: any) => 
                part.mimeType === "text/plain" && part.body && part.body.data
            );
            let isHtml = false;
            
            if (!textPart) {
                textPart = response.payload.parts.find((part: any) => 
                    part.mimeType === "text/html" && part.body && part.body.data
                );
                isHtml = true;
            }

            if (textPart && textPart.body && textPart.body.data) {
                try {
                    const decoded = decodeBase64Url(textPart.body.data);
                    const cleaned = cleanEmailBody(decoded, isHtml);
                    const { content, truncated, contentLength } = truncateContent(cleaned);
                    result.data = content;
                    result.truncated = truncated;
                    result.contentLength = contentLength;
                } catch (error) {
                    // If decoding fails, keep the raw data
                    result.data = textPart.body.data;
                }
            }
        } else if (response.payload && response.payload.body && response.payload.body.data) {
            // Handle case where body is directly in payload (not in parts)
            try {
                const decoded = decodeBase64Url(response.payload.body.data);
                // Check if it looks like HTML
                const isHtml = response.payload.mimeType === 'text/html' || /<[^>]+>/.test(decoded);
                const cleaned = cleanEmailBody(decoded, isHtml);
                const { content, truncated, contentLength } = truncateContent(cleaned);
                result.data = content;
                result.truncated = truncated;
                result.contentLength = contentLength;
            } catch (error) {
                result.data = response.payload.body.data;
            }
        }

        return withSimplifiedResponseMeta(result, GMAIL_EMAIL_BY_ID_SIMPLIFIED_PROPERTIES, {
            attachmentItemProperties: GMAIL_ATTACHMENT_ITEM_PROPERTIES,
        });
    },
    "OUTLOOK_GET_MESSAGES": function(response: any): any {
        if (!response) {
            return response;
        }

        if (Array.isArray(response)) {
            return response.map(sanitizeOutlookMessage);
        }

        if (typeof response === "object" && Array.isArray(response.value)) {
            return {
                ...response,
                value: response.value.map(sanitizeOutlookMessage),
            };
        }

        return sanitizeOutlookMessage(response);
    },
    "OUTLOOK_GET_MESSAGE_BY_ID": function(response: any): any {
        return sanitizeOutlookMessage(response);
    },
}