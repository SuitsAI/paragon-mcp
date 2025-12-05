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
        }

        // Extract body data from parts
        if (response.payload && response.payload.parts && Array.isArray(response.payload.parts)) {
            // Try to find text/plain first, then text/html
            let textPart = response.payload.parts.find((part: any) => 
                part.mimeType === "text/plain" && part.body && part.body.data
            );
            
            if (!textPart) {
                textPart = response.payload.parts.find((part: any) => 
                    part.mimeType === "text/html" && part.body && part.body.data
                );
            }

            if (textPart && textPart.body && textPart.body.data) {
                try {
                    // Decode base64url encoded data
                    // Base64url uses - and _ instead of + and /, and may omit padding
                    const base64Data = textPart.body.data
                        .replace(/-/g, '+')
                        .replace(/_/g, '/');
                    // Add padding if needed
                    const padding = base64Data.length % 4;
                    const paddedData = padding ? base64Data + '='.repeat(4 - padding) : base64Data;
                    result.data = Buffer.from(paddedData, 'base64').toString('utf-8');
                } catch (error) {
                    // If decoding fails, keep the raw data
                    result.data = textPart.body.data;
                }
            }
        } else if (response.payload && response.payload.body && response.payload.body.data) {
            // Handle case where body is directly in payload (not in parts)
            try {
                const base64Data = response.payload.body.data
                    .replace(/-/g, '+')
                    .replace(/_/g, '/');
                const padding = base64Data.length % 4;
                const paddedData = padding ? base64Data + '='.repeat(4 - padding) : base64Data;
                result.data = Buffer.from(paddedData, 'base64').toString('utf-8');
            } catch (error) {
                result.data = response.payload.body.data;
            }
        }

        return result;
    }
}