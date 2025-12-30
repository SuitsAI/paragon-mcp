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

// Helper function to clean email body text
function cleanEmailBody(rawData: string, isHtml: boolean): string {
    let text = rawData;
    
    // Strip HTML if needed
    if (isHtml || /<[^>]+>/.test(text)) {
        text = stripHtml(text);
    }
    
    // Remove forwarded content
    text = removeForwardedContent(text);
    
    return text;
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
                    result.data = cleanEmailBody(decoded, isHtml);
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
                result.data = cleanEmailBody(decoded, isHtml);
            } catch (error) {
                result.data = response.payload.body.data;
            }
        }

        return result;
    }
}