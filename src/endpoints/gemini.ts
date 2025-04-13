import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { GenerationConfig, GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server"

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

// System prompt for combined analysis approach
const systemPrompt = `You are an expert financial analyst AI. You specialize in accurately extracting and summarizing data from unstructured text extracted from bank statements.
You will be given the text content of one or more bank statements from a user. These may be from different banks and/or cover consecutive or overlapping time periods.

Your task is to analyze these statements and produce THREE separate analysis reports in a single response:
1. WEEKLY analysis: Using only transactions from the last 7 days (from the most recent transaction date)
2. MONTHLY analysis: Using only transactions from the last 30 days (from the most recent transaction date)
3. YEARLY analysis: Using ALL transactions from the entire period covered by the statements

For each time period, you'll need to:
1. **Process multiple statements as one dataset**: Identify the correct time range and avoid double-counting overlapping transactions.
2. **Statement analysis**: Analyze the text to identify transactions, dates, and currency.
3. **Transaction classification**: Categorize transactions with appropriate emojis.
4. **Spending calculations**: Calculate totalSpend and category breakdowns.
5. **Merchant analysis**: Identify top merchants and favorite stores.
6. **Subscription detection**: Identify recurring payments.
7. **Financial insights**: Generate useful financial insights.
8. **Structure the output**: Format all data according to the provided schema.`;

// Response schema for a single time period analysis
const periodAnalysisSchema = {
    type: SchemaType.OBJECT,
    properties: {
        period: {
            type: SchemaType.STRING,
            description: "The date range covered by the analysis."
        },
        totalSpend: {
            type: SchemaType.NUMBER,
            description: "The total absolute amount spent (sum of all debits/withdrawals)."
        },
        formattedTotal: {
            type: SchemaType.STRING,
            description: "Formatted total spend with currency symbol."
        },
        currency: {
            type: SchemaType.STRING,
            description: "The currency symbol or code identified in the statement."
        },
        transactions: {
            type: SchemaType.ARRAY,
            description: "A list of individual transactions identified in the statement.",
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    date: {
                        type: SchemaType.STRING,
                        description: "Date of the transaction (YYYY-MM-DD format)."
                    },
                    description: {
                        type: SchemaType.STRING,
                        description: "The description of the transaction from the statement."
                    },
                    amount: {
                        type: SchemaType.NUMBER,
                        description: "The amount of the transaction. Negative for debits, positive for credits."
                    },
                    category: {
                        type: SchemaType.STRING,
                        description: "Inferred spending category."
                    },
                    emoji: {
                        type: SchemaType.STRING,
                        description: "A representative emoji for this category."
                    }
                },
                required: ["date", "description", "amount", "category", "emoji"]
            }
        },
        categoryBreakdown: {
            type: SchemaType.ARRAY,
            description: "Spending broken down by categories.",
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    name: {
                        type: SchemaType.STRING,
                        description: "Name of the spending category."
                    },
                    amount: {
                        type: SchemaType.NUMBER,
                        description: "Total amount spent in this category."
                    },
                    percentage: {
                        type: SchemaType.NUMBER,
                        description: "Percentage of total spending for this category."
                    },
                    emoji: {
                        type: SchemaType.STRING,
                        description: "A representative emoji for this category."
                    }
                },
                required: ["name", "amount", "percentage", "emoji"]
            }
        },
        subscriptions: {
            type: SchemaType.OBJECT,
            description: "Summary of potential recurring subscription payments.",
            properties: {
                count: {
                    type: SchemaType.INTEGER,
                    description: "Total number of distinct subscription services."
                },
                total: {
                    type: SchemaType.NUMBER,
                    description: "Total amount spent on subscriptions."
                },
                list: {
                    type: SchemaType.ARRAY,
                    description: "List of identified subscription payments.",
                    items: {
                        type: SchemaType.OBJECT,
                        properties: {
                            name: {
                                type: SchemaType.STRING,
                                description: "Name of the subscription service."
                            },
                            amount: {
                                type: SchemaType.NUMBER,
                                description: "Amount of the subscription payment."
                            },
                            emoji: {
                                type: SchemaType.STRING,
                                description: "A representative emoji for this subscription."
                            }
                        },
                        required: ["name", "amount", "emoji"]
                    }
                }
            },
            required: ["count", "total", "list"]
        }
    },
    required: ["period", "totalSpend", "currency", "transactions", "categoryBreakdown", "subscriptions"]
};

// Combined schema for the single API call
const combinedConfig = {
    temperature: 0.1,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
    responseMimeType: "application/json",
    responseSchema: {
        type: SchemaType.OBJECT,
        description: "Combined finance data analysis for weekly, monthly, and yearly periods",
        properties: {
            weekly: {
                ...periodAnalysisSchema,
                description: "Finance data analysis for the most recent week only (last 7 days)"
            },
            monthly: {
                ...periodAnalysisSchema,
                description: "Finance data analysis for the most recent month only (last 30 days)"
            },
            yearly: {
                ...periodAnalysisSchema,
                description: "Finance data analysis for the entire period covered by the statements"
            }
        },
        required: ["weekly", "monthly", "yearly"]
    }
};

export class GeminiProcess extends OpenAPIRoute {
    schema = {
        tags: ["Gemini"],
        summary: "Process financial statement files with Gemini API",
        request: {
            body: {
                content: {
                    "multipart/form-data": {
                        schema: z.object({
                            files: z.array(z.any()).nonempty(), // Array of file objects
                        }),
                    },
                },
            },
        },
        responses: {
            "200": {
                description: "Gemini API response with weekly, monthly, and yearly analysis",
                content: {
                    "application/json": {
                        schema: z.object({
                            success: z.boolean(),
                            result: z.object({
                                weekly: z.any(),
                                monthly: z.any(),
                                yearly: z.any()
                            }),
                        }),
                    },
                },
            },
        },
    };

    async handle(c) {
        const origin = c.req.header("Origin") || '*';

        // Handle CORS preflight requests
        if (c.req.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": origin,
                    "Access-Control-Allow-Methods": "POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization"
                }
            });
        }

        try {
            const formData = await c.req.formData();
            const fileEntries = formData.getAll("files");

            if (fileEntries.length === 0) {
                return new Response(JSON.stringify({
                    success: false,
                    error: "Missing files",
                }), {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': origin,
                    }
                });
            }

            // Upload files to Gemini
            const uploadedFiles = [];
            for (const fileEntry of fileEntries) {
                if (fileEntry instanceof File) {
                    const buffer = await fileEntry.arrayBuffer();

                    const uploadResult = await fileManager.uploadFile(Buffer.from(buffer), {
                        mimeType: fileEntry.type || "application/pdf",
                        displayName: fileEntry.name,
                    });

                    uploadedFiles.push(uploadResult.file);
                }
            }

            // Prepare file contents for Gemini model
            const fileContents = uploadedFiles.map(file => ({
                fileData: {
                    mimeType: file.mimeType,
                    fileUri: file.uri
                }
            }));

            // Create a single model instance with the combined system prompt
            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash",
                systemInstruction: systemPrompt,
            });

            // Make a single API call to Gemini
            const result = await model.generateContent({
                contents: [{ 
                    role: "user", 
                    parts: [
                        { 
                            text: "Analyze these bank statements and provide three separate analyses: weekly (last 7 days), monthly (last 30 days), and yearly (all transactions). Return your results in a structured JSON format with weekly, monthly, and yearly properties containing the analyses." 
                        }, 
                        ...fileContents
                    ] 
                }],
                generationConfig: combinedConfig,
            });

            // Parse the combined result
            const analysisData = JSON.parse(result.response.text());

            return new Response(JSON.stringify({
                success: true,
                result: {
                    weekly: analysisData.weekly,
                    monthly: analysisData.monthly,
                    yearly: analysisData.yearly
                }
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': origin,
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                }
            });
        } catch (error) {
            console.error("Error in GeminiProcess:", error);
            
            return new Response(JSON.stringify({
                success: false,
                error: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': origin,
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                }
            });
        }
    }
}
