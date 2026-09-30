import { UserNotConnectedError } from "./errors";
import { ExtendedTool } from "./type";
import { envs, handleResponseErrors, readResponseBody } from "./utils";

const SLIDES_API_BASE = "https://slides.googleapis.com/v1";
const GDRIVE_INTEGRATION = "googledrive";
const ACCESS_TOKEN_FIELD = "OAUTH_ACCESS_TOKEN";

export const GOOGLE_SLIDES_TOOL_NAMES = [
  "GOOGLE_SLIDES_GET_PRESENTATION",
  "GOOGLE_SLIDES_CREATE_PRESENTATION",
  "GOOGLE_SLIDES_BATCH_UPDATE",
  "GOOGLE_SLIDES_GET_PAGE",
  "GOOGLE_SLIDES_GET_PAGE_THUMBNAIL",
] as const;

export type GoogleSlidesToolName = (typeof GOOGLE_SLIDES_TOOL_NAMES)[number];

const BATCH_UPDATE_DESCRIPTION = `Applies one or more updates to a Google Slides presentation in a single atomic request (POST presentations.batchUpdate). If any request is invalid, nothing is applied.

presentationId is the Drive file id. requests is an array of Google Slides Request objects. Common requests:
- createSlide: { "createSlide": { "insertionIndex": 1, "slideLayoutReference": { "predefinedLayout": "BLANK" } } }
- insertText: { "insertText": { "objectId": "<shapeId>", "insertionIndex": 0, "text": "Hello" } }
- replaceAllText: { "replaceAllText": { "containsText": { "text": "{{name}}", "matchCase": false }, "replaceText": "Ada" } }
- deleteObject: { "deleteObject": { "objectId": "<objectId>" } }

writeControl.requiredRevisionId is optional and rejects the write when the presentation revision has changed.`;

export function createGoogleSlidesTools(): ExtendedTool[] {
  return [
    {
      name: "GOOGLE_SLIDES_GET_PRESENTATION",
      description:
        "Gets the latest version of a Google Slides presentation, including slide, layout, and master page object ids. presentationId is the Google Drive file id. Calls the Google Slides API with the connected Google Drive account.",
      integrationName: GDRIVE_INTEGRATION,
      requiredFields: ["presentationId"],
      isOpenApiTool: false,
      isCustomTool: true,
      inputSchema: {
        type: "object",
        properties: {
          presentationId: {
            type: "string",
            description: "The ID of the presentation to retrieve.",
          },
          commentsViewMode: {
            type: "string",
            enum: [
              "COMMENTS_VIEW_MODE_UNSPECIFIED",
              "COMMENTS_VIEW_MODE_OMITTED",
              "COMMENTS_VIEW_MODE_INCLUDED",
            ],
            description:
              "Whether comments are omitted or included. Defaults to COMMENTS_VIEW_MODE_OMITTED.",
          },
        },
        required: ["presentationId"],
        additionalProperties: false,
      },
    },
    {
      name: "GOOGLE_SLIDES_CREATE_PRESENTATION",
      description:
        "Creates a blank Google Slides presentation. Only title (and an optional presentationId) are used; other presentation fields are ignored by the API. Calls the Google Slides API with the connected Google Drive account.",
      integrationName: GDRIVE_INTEGRATION,
      requiredFields: ["title"],
      isOpenApiTool: false,
      isCustomTool: true,
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Title of the new presentation.",
          },
          presentationId: {
            type: "string",
            description:
              "Optional ID to assign to the new presentation. Omit to let Google generate one.",
          },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
    {
      name: "GOOGLE_SLIDES_BATCH_UPDATE",
      description: BATCH_UPDATE_DESCRIPTION,
      integrationName: GDRIVE_INTEGRATION,
      requiredFields: ["presentationId", "requests"],
      isOpenApiTool: false,
      isCustomTool: true,
      inputSchema: {
        type: "object",
        properties: {
          presentationId: {
            type: "string",
            description: "The presentation to apply the updates to.",
          },
          requests: {
            type: "array",
            description:
              "Updates to apply, in order. Each item is one Slides Request object such as createSlide, insertText, replaceAllText, or deleteObject.",
            items: {
              type: "object",
              additionalProperties: true,
            },
          },
          writeControl: {
            type: "object",
            description:
              "Optional write control. Set requiredRevisionId to the revisionId from a previous read.",
            properties: {
              requiredRevisionId: { type: "string" },
            },
            additionalProperties: false,
          },
        },
        required: ["presentationId", "requests"],
        additionalProperties: false,
      },
    },
    {
      name: "GOOGLE_SLIDES_GET_PAGE",
      description:
        "Gets one page (slide, layout, master, or notes master) from a presentation. Use GOOGLE_SLIDES_GET_PRESENTATION first to find pageObjectId values in slides[].objectId. Calls the Google Slides API with the connected Google Drive account.",
      integrationName: GDRIVE_INTEGRATION,
      requiredFields: ["presentationId", "pageObjectId"],
      isOpenApiTool: false,
      isCustomTool: true,
      inputSchema: {
        type: "object",
        properties: {
          presentationId: {
            type: "string",
            description: "The ID of the presentation.",
          },
          pageObjectId: {
            type: "string",
            description: "The object ID of the page to retrieve.",
          },
        },
        required: ["presentationId", "pageObjectId"],
        additionalProperties: false,
      },
    },
    {
      name: "GOOGLE_SLIDES_GET_PAGE_THUMBNAIL",
      description:
        "Generates a thumbnail of a presentation page and returns width, height, and a contentUrl that expires after about 30 minutes. pageObjectId comes from slides[].objectId. Calls the Google Slides API with the connected Google Drive account.",
      integrationName: GDRIVE_INTEGRATION,
      requiredFields: ["presentationId", "pageObjectId"],
      isOpenApiTool: false,
      isCustomTool: true,
      inputSchema: {
        type: "object",
        properties: {
          presentationId: {
            type: "string",
            description: "The ID of the presentation.",
          },
          pageObjectId: {
            type: "string",
            description: "The object ID of the page to thumbnail.",
          },
          mimeType: {
            type: "string",
            enum: ["PNG"],
            description: "Thumbnail image mime type. Defaults to PNG.",
          },
          thumbnailSize: {
            type: "string",
            enum: [
              "THUMBNAIL_SIZE_UNSPECIFIED",
              "LARGE",
              "MEDIUM",
              "SMALL",
            ],
            description:
              "Thumbnail width: LARGE is 1600px, MEDIUM is 800px, SMALL is 200px. Omit to let the server choose.",
          },
        },
        required: ["presentationId", "pageObjectId"],
        additionalProperties: false,
      },
    },
  ];
}

export function isGoogleSlidesTool(name: string): name is GoogleSlidesToolName {
  return (GOOGLE_SLIDES_TOOL_NAMES as readonly string[]).includes(name);
}

export async function performGoogleSlidesTool(
  name: GoogleSlidesToolName,
  args: Record<string, unknown>,
  jwt: string,
  credentialId: string | null
): Promise<unknown> {
  const accessToken = await getGoogleDriveAccessToken(jwt, credentialId);

  switch (name) {
    case "GOOGLE_SLIDES_GET_PRESENTATION": {
      const presentationId = requireString(args, "presentationId");
      return callSlidesApi(accessToken, {
        method: "GET",
        path: `/presentations/${encodeURIComponent(presentationId)}`,
        query: {
          commentsViewMode: optionalString(args, "commentsViewMode"),
        },
      });
    }
    case "GOOGLE_SLIDES_CREATE_PRESENTATION": {
      const title = requireString(args, "title");
      const presentationId = optionalString(args, "presentationId");
      return callSlidesApi(accessToken, {
        method: "POST",
        path: "/presentations",
        body: {
          title,
          ...(presentationId ? { presentationId } : {}),
        },
      });
    }
    case "GOOGLE_SLIDES_BATCH_UPDATE": {
      const presentationId = requireString(args, "presentationId");
      if (!Array.isArray(args.requests)) {
        throw new Error("Missing required field: requests");
      }
      return callSlidesApi(accessToken, {
        method: "POST",
        path: `/presentations/${encodeURIComponent(presentationId)}:batchUpdate`,
        body: {
          requests: args.requests,
          ...(args.writeControl ? { writeControl: args.writeControl } : {}),
        },
      });
    }
    case "GOOGLE_SLIDES_GET_PAGE": {
      const presentationId = requireString(args, "presentationId");
      const pageObjectId = requireString(args, "pageObjectId");
      return callSlidesApi(accessToken, {
        method: "GET",
        path: `/presentations/${encodeURIComponent(presentationId)}/pages/${encodeURIComponent(pageObjectId)}`,
      });
    }
    case "GOOGLE_SLIDES_GET_PAGE_THUMBNAIL": {
      const presentationId = requireString(args, "presentationId");
      const pageObjectId = requireString(args, "pageObjectId");
      return callSlidesApi(accessToken, {
        method: "GET",
        path: `/presentations/${encodeURIComponent(presentationId)}/pages/${encodeURIComponent(pageObjectId)}/thumbnail`,
        query: {
          "thumbnailProperties.mimeType": optionalString(args, "mimeType"),
          "thumbnailProperties.thumbnailSize": optionalString(
            args,
            "thumbnailSize"
          ),
        },
      });
    }
  }
}

async function getGoogleDriveAccessToken(
  jwt: string,
  credentialId: string | null
): Promise<string> {
  const url = new URL(
    `${envs.ZEUS_BASE_URL}/projects/${envs.PROJECT_ID}/sdk/credentials`
  );
  url.searchParams.set("integration", GDRIVE_INTEGRATION);
  url.searchParams.set("includeAccountAuth", "true");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...(credentialId ? { "X-Paragon-Credential": credentialId } : {}),
    },
  });

  if (!response.ok) {
    await handleResponseErrors(response);
  }

  const body = await readResponseBody(response);
  const token = readAccessToken(body);
  if (!token) {
    if (isDisconnected(body)) {
      throw notConnectedError();
    }
    throw new Error(
      "Google Drive account did not return an OAuth access token."
    );
  }
  return token;
}

function readAccessToken(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const record = body as Record<string, unknown>;
  const direct = tokenFromAccountAuth(record.accountAuth);
  if (direct) {
    return direct;
  }
  if (Array.isArray(record.credentials)) {
    for (const credential of record.credentials) {
      if (credential && typeof credential === "object") {
        const token = tokenFromAccountAuth(
          (credential as Record<string, unknown>).accountAuth
        );
        if (token) {
          return token;
        }
      }
    }
  }
  return null;
}

function tokenFromAccountAuth(accountAuth: unknown): string | null {
  if (!accountAuth || typeof accountAuth !== "object") {
    return null;
  }
  const auth = accountAuth as Record<string, unknown>;
  const token =
    auth[ACCESS_TOKEN_FIELD] ?? auth.access_token ?? auth.accessToken;
  return typeof token === "string" && token.length > 0 ? token : null;
}

function isDisconnected(body: unknown): boolean {
  if (!body || typeof body !== "object") {
    return true;
  }
  const record = body as Record<string, unknown>;
  return record.hasCredential === false || record.enabled === false;
}

function notConnectedError(): UserNotConnectedError {
  return new UserNotConnectedError("Integration not enabled for user.", {
    message: "Integration not enabled for user.",
    code: "integration_not_enabled",
    status: 404,
    meta: {
      personaId: "",
      projectId: envs.PROJECT_ID,
      integrationId: "",
      endUserId: "",
    },
  });
}

async function callSlidesApi(
  accessToken: string,
  request: {
    method: "GET" | "POST";
    path: string;
    query?: Record<string, string | undefined>;
    body?: unknown;
  }
): Promise<unknown> {
  const url = new URL(`${SLIDES_API_BASE}${request.path}`);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: request.method === "GET" ? undefined : JSON.stringify(request.body),
  });

  const body = await readResponseBody(response);
  if (!response.ok) {
    throw new Error(
      `Google Slides API error; status: ${response.status}; message: ${googleErrorMessage(body, response)}`
    );
  }
  return body;
}

function googleErrorMessage(body: unknown, response: Response): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: { message?: unknown } }).error;
    if (error && typeof error.message === "string") {
      return error.message;
    }
  }
  if (typeof body === "string" && body.trim()) {
    return body.trim().slice(0, 2000);
  }
  return response.statusText || "Unknown error";
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required field: ${key}`);
  }
  return value;
}

function optionalString(
  args: Record<string, unknown>,
  key: string
): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
