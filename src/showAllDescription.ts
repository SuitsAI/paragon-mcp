const NEVER_IN_LOOP =
  "Never set true in a loop or when paginating through many items.";

function buildShowAllDescription({
  falseWhen,
  simplifiedFields,
  trueWhen,
  notes,
}: {
  falseWhen: string;
  simplifiedFields: string;
  trueWhen: string;
  notes?: string;
}): string {
  return [
    "Default is false.",
    `Use false when ${falseWhen}. Returns: ${simplifiedFields}.`,
    `Use true only when ${trueWhen}.`,
    notes,
    NEVER_IN_LOOP,
  ]
    .filter(Boolean)
    .join(" ");
}

export function getActionShowAllDescription(toolName: string): string {
  switch (toolName) {
    case "GMAIL_GET_EMAIL_BY_ID":
      return buildShowAllDescription({
        falseWhen:
          "reading, searching, or summarizing an email (subject, sender, body text, attachment metadata)",
        simplifiedFields:
          "id, threadId, subject, sender, receiver, date, plain-text body, attachments list",
        trueWhen:
          "the user explicitly needs raw Gmail fields missing from the simplified response (e.g. labelIds, snippet) for a single email",
        notes:
          "HTML bodies and binary attachment data are always omitted regardless of this flag.",
      });
    case "OUTLOOK_GET_MESSAGES":
      return buildShowAllDescription({
        falseWhen:
          "searching, listing, or summarizing emails (invoices, notifications, threads)",
        simplifiedFields:
          "an array of messages (or { value, nextLink } when paginated) with id, threadId, subject, sender, receiver, date, plain-text data (max 1500 chars), attachments metadata",
        trueWhen:
          "the user explicitly needs raw Microsoft Graph fields missing from the simplified response (e.g. categories, webLink) for a small result set",
        notes:
          "HTML bodies, contentBytes, HTTP headers, and OData metadata are always omitted regardless of this flag.",
      });
    case "OUTLOOK_GET_MESSAGE_BY_ID":
      return buildShowAllDescription({
        falseWhen:
          "reading or summarizing a single email",
        simplifiedFields:
          "id, threadId, subject, sender, receiver, cc, bcc, date, plain-text data (max 1500 chars), attachments metadata",
        trueWhen:
          "the user explicitly needs raw Microsoft Graph fields missing from the simplified response for this one message",
        notes:
          "HTML bodies, contentBytes, HTTP headers, and OData metadata are always omitted regardless of this flag.",
      });
    case "ASANA_GET_TASKS":
      return buildShowAllDescription({
        falseWhen:
          "listing, searching, or working with tasks (names, IDs, status, assignees)",
        simplifiedFields:
          "gid, name, and other task fields without redundant resource_type metadata",
        trueWhen:
          "the user explicitly needs the full raw Asana API task object including resource_type and resource_subtype on every item",
      });
    default:
      return buildShowAllDescription({
        falseWhen: "the simplified response contains the fields needed for the task",
        simplifiedFields: "a token-efficient subset of the API response",
        trueWhen:
          "the user explicitly requires raw API fields that are not in the simplified response",
      });
  }
}

export const CALL_API_REQUEST_SHOW_ALL = buildShowAllDescription({
  falseWhen:
    "almost all requests — reading data, searching, listing records, or fetching IDs",
  simplifiedFields:
    "status plus simplified output (no HTTP headers, OData metadata, HTML email bodies, or base64 attachment bytes)",
  trueWhen:
    "the user explicitly needs extra API metadata fields not included in the simplified response, for a single record or small result set",
  notes:
    "Binary content (contentBytes, email HTML bodies) is always omitted. For Outlook or Gmail attachment file contents, use OUTLOOK_GET_ATTACHMENT_CONTENT or GMAIL_GET_ATTACHMENT_CONTENT instead of showAll on a bytes endpoint.",
});

export function getAttachmentContentShowAllDescription(
  integration: "outlook" | "gmail",
  simplifiedFields: string
): string {
  const toolName =
    integration === "outlook"
      ? "OUTLOOK_GET_ATTACHMENT_CONTENT"
      : "GMAIL_GET_ATTACHMENT_CONTENT";

  return buildShowAllDescription({
    falseWhen: `reading or extracting text from a file attachment (use ${toolName} with false first)`,
    simplifiedFields,
    trueWhen:
      "decoded text extraction failed, the file is non-text, or the user explicitly needs raw base64/contentBytes for download",
    notes: `Prefer false. ${toolName} with false returns decoded text for PDF, DOCX, CSV, TXT, and HTML (up to 5000 characters).`,
  });
}
