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
2. **Statement analysis**: Extract all transactions with accurate dates, descriptions, and amounts.
3. **Transaction classification**: Categorize transactions into appropriate categories with fitting emojis.
4. **Subscription detection**: Identify recurring payments based on description patterns and frequencies.

Focus primarily on accurate extraction of transaction data. Don't worry about calculating totals or percentages - those will be calculated later.`;

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
                type: SchemaType.OBJECT,
                properties: {
                    period: {
                        type: SchemaType.STRING,
                        description: "The date range covered by the weekly analysis."
                    },
                    currency: {
                        type: SchemaType.STRING,
                        description: "The currency symbol or code identified in the statement."
                    },
                    transactions: {
                        type: SchemaType.ARRAY,
                        description: "A list of individual transactions identified in the last 7 days.",
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
                    possibleSubscriptions: {
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
                required: ["period", "currency", "transactions", "possibleSubscriptions"]
            },
            monthly: {
                type: SchemaType.OBJECT,
                properties: {
                    period: {
                        type: SchemaType.STRING,
                        description: "The date range covered by the monthly analysis."
                    },
                    currency: {
                        type: SchemaType.STRING,
                        description: "The currency symbol or code identified in the statement."
                    },
                    transactions: {
                        type: SchemaType.ARRAY,
                        description: "A list of individual transactions identified in the last 30 days.",
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
                    possibleSubscriptions: {
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
                required: ["period", "currency", "transactions", "possibleSubscriptions"]
            },
            yearly: {
                type: SchemaType.OBJECT,
                properties: {
                    period: {
                        type: SchemaType.STRING,
                        description: "The date range covered by the yearly analysis."
                    },
                    currency: {
                        type: SchemaType.STRING,
                        description: "The currency symbol or code identified in the statement."
                    },
                    transactions: {
                        type: SchemaType.ARRAY,
                        description: "A list of individual transactions identified in the entire period.",
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
                    possibleSubscriptions: {
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
                required: ["period", "currency", "transactions", "possibleSubscriptions"]
            }
        },
        required: ["weekly", "monthly", "yearly"]
    }
};

// Function to recalculate all financial metrics from transaction data
const calculateFinancialMetrics = (periodData) => {
    if (!periodData || !periodData.transactions || !Array.isArray(periodData.transactions)) {
        return null;
    }

    // Create deep copy to avoid mutating original data
    const result = JSON.parse(JSON.stringify(periodData));
    
    // Calculate total spend (sum of absolute values of negative transactions)
    const spendTransactions = result.transactions.filter(t => t.amount < 0);
    result.totalSpend = spendTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    // Format the total with currency
    result.formattedTotal = `${result.currency}${result.totalSpend.toFixed(2)}`;
    
    // Calculate category breakdown
    const categories = {};
    spendTransactions.forEach(transaction => {
        const category = transaction.category;
        if (!categories[category]) {
            categories[category] = {
                name: category,
                amount: 0,
                emoji: transaction.emoji
            };
        }
        categories[category].amount += Math.abs(transaction.amount);
    });
    
    // Convert to array and calculate percentages
    result.categoryBreakdown = Object.values(categories);
    result.categoryBreakdown.forEach(category => {
        category.amount = parseFloat(category.amount.toFixed(2)); // Round to 2 decimal places
        category.percentage = parseFloat(((category.amount / result.totalSpend) * 100).toFixed(2));
    });
    
    // Sort categories by amount (descending)
    result.categoryBreakdown.sort((a, b) => b.amount - a.amount);
    
    // Process subscriptions
    const subscriptions = result.possibleSubscriptions || [];
    const subscriptionTotal = subscriptions.reduce((sum, sub) => sum + Math.abs(sub.amount), 0);
    
    result.subscriptions = {
        count: subscriptions.length,
        total: parseFloat(subscriptionTotal.toFixed(2)),
        list: subscriptions
    };
    
    // Clean up intermediate data
    delete result.possibleSubscriptions;
    
    return result;
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

            // Create a single model instance with the simplified system prompt
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
                            text: "Analyze these bank statements and provide three separate analyses: weekly (last 7 days), monthly (last 30 days), and yearly (all transactions). Focus on accurate transaction extraction and categorization." 
                        }, 
                        ...fileContents
                    ] 
                }],
                generationConfig: combinedConfig,
            });

            // Parse the combined result
            const rawAnalysisData = JSON.parse(result.response.text());

            // Recalculate all financial metrics using our accurate calculation function
            const processedData = {
                weekly: calculateFinancialMetrics(rawAnalysisData.weekly),
                monthly: calculateFinancialMetrics(rawAnalysisData.monthly),
                yearly: calculateFinancialMetrics(rawAnalysisData.yearly)
            };

            return new Response(JSON.stringify({
                success: true,
                result: processedData
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
