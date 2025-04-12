import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import {GenerationConfig, GoogleGenerativeAI, SchemaType} from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server"

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

const systemPrompt = `You are an expert financial analyst AI. You specialize in accurately extracting and summarizing data from unstructured text extracted from bank statements.
You will be given the text content of one or more bank statements from a user. These may be from different banks and/or cover consecutive or overlapping time periods.
Your task is to:
1. **Process multiple statements as one dataset**: If multiple statements are provided, treat them as a single comprehensive financial dataset. Identify the broadest time range that covers all statements and avoid double-counting overlapping transactions.
2. **Statement analysis**: Carefully analyze the entire text to identify:
   - The combined statement period (earliest date to latest date across all statements)
   - Currency used (if multiple currencies appear, note each one)
   - All individual transactions (date, description, amount)
3. **Transaction classification**: For each transaction:
   - Determine if it's a debit (spending/withdrawal) or credit (income/deposit)
   - Assign a relevant category (e.g., 'Shopping', 'Food & Dining', 'Transport', 'Utilities', 'Salary', 'Transfer', 'Entertainment', 'Subscriptions', 'Other')
   - Generate an appropriate emoji for the category (e.g., 🛒 for Shopping, 🍔 for Food & Dining)
   - Detect duplicate transactions that might appear across multiple statements and count them only once
4. **Spending calculations**:
   - Calculate \`totalSpend\` by summing the absolute values of all identified debit transactions
   - Create \`formattedTotal\` with proper currency symbol and formatting
   - Calculate spending breakdown by category (\`categoryBreakdown\`) with appropriate emojis and visualization colors
5. **Merchant analysis**:
   - Identify the top 3-5 merchants (\`topMerchants\`) based on total spending
   - Include visit frequency and representative emojis for each merchant
   - Identify a \`favoriteStore\` based on visit frequency
6. **Subscription detection**:
   - Identify potential recurring subscriptions across all statements
   - Calculate total subscription spending and its percentage of total spending
   - Identify the top subscription services by amount
   - Assign appropriate emojis to each subscription service
7. **Financial insights**:
   - Identify impulse purchases and calculate potential savings
   - Determine spending trends and patterns
   - Assign a money personality/mood based on spending habits
   - Calculate progress toward savings goals if detectable
   - Identify improved habits by comparing statement periods if applicable
8. **Generate highlights**:
   - Create a compelling \`highlight\` insight from the analysis
   - Identify the \`topPurchase\` with merchant and emoji
   - Determine the \`topCategory\` with amount and emoji
9. **Structure the output**: Format all data according to the provided schema, ensuring all required fields are populated and data types match exactly.`;

const generationConfig: GenerationConfig = {
    temperature: 0.1,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
    responseMimeType: "application/json",
    responseSchema: {
        type: SchemaType.OBJECT,
        description: "Unified Finance Wrapped Data Extractor schema for structured data extracted and analyzed from bank statements, supporting weekly, monthly, or yearly summaries. Emojis are required.",
        properties: {
            period: {
                type: SchemaType.STRING,
                description: "The date range covered by the analysis (e.g., 'May 6 - May 12, 2025', 'May 2025', '2025'). Should match the input request's desired granularity."
            },
            totalSpend: {
                type: SchemaType.NUMBER,
                description: "The total absolute amount spent (sum of all debits/withdrawals) during the period. Should be a positive number."
            },
            formattedTotal: {
                type: SchemaType.STRING,
                description: "Formatted total spend with currency symbol (e.g., '$1,854.32'). Derived from totalSpend and currency."
            },
            currency: {
                type: SchemaType.STRING,
                description: "The currency symbol or code (e.g., $, €, GBP, USD) identified in the statement."
            },
            transactions: {
                type: SchemaType.ARRAY,
                description: "A list of individual transactions identified in the statement. This is the base data used for calculating summaries.",
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
                            description: "The amount of the transaction. Negative for debits/spending, positive for credits/deposits."
                        },
                        category: {
                            type: SchemaType.STRING,
                            description: "Inferred spending category (e.g., 'Food', 'Transport', 'Shopping', 'Entertainment', 'Housing', 'Other'). Use consistent categories."
                        },
                        emoji: {
                            type: SchemaType.STRING,
                            description: "A single representative emoji character for this transaction's category. Required."
                        }
                    },
                    required: [
                        "date",
                        "description",
                        "amount",
                        "category",
                        "emoji"
                    ]
                }
            },
            categoryBreakdown: {
                type: SchemaType.ARRAY,
                description: "Spending broken down by inferred categories. Only includes spending categories (debits). Sum of amounts should approximate totalSpend.",
                items: {
                    type: SchemaType.OBJECT,
                    properties: {
                        name: {
                            type: SchemaType.STRING,
                            description: "Name of the spending category (consistent with transaction categories)."
                        },
                        amount: {
                            type: SchemaType.NUMBER,
                            description: "Total absolute amount spent in this category (positive number)."
                        },
                        percentage: {
                            type: SchemaType.NUMBER,
                            description: "Percentage of total spending for this category (category amount / totalSpend * 100)."
                        },
                        color: {
                            type: SchemaType.STRING,
                            description: "Suggested visualization color hint (e.g., CSS class 'from-pink-500 to-orange-500' or hex code)."
                        },
                        emoji: {
                            type: SchemaType.STRING,
                            description: "A single representative emoji character for this category. Required."
                        }
                    },
                    required: [
                        "name",
                        "amount",
                        "percentage",
                        "emoji"
                    ]
                }
            },
            topMerchants: {
                type: SchemaType.ARRAY,
                description: "Merchants with the highest total spending during the period (typically for monthly/yearly view). Derived from transactions.",
                items: {
                    type: SchemaType.OBJECT,
                    properties: {
                        name: {
                            type: SchemaType.STRING,
                            description: "Inferred name of the merchant."
                        },
                        amount: {
                            type: SchemaType.NUMBER,
                            description: "Total absolute amount spent at this merchant (positive number)."
                        },
                        category: {
                            type: SchemaType.STRING,
                            description: "The primary category associated with this merchant's spending."
                        },
                        visits: {
                            type: SchemaType.INTEGER,
                            description: "Number of transactions associated with this merchant (relevant for favoriteStore logic)."
                        },
                        emoji: {
                            type: SchemaType.STRING,
                            description: "A single representative emoji character for this merchant or its category. Required."
                        }
                    },
                    required: [
                        "name",
                        "amount",
                        "category",
                        "visits",
                        "emoji"
                    ]
                }
            },
            subscriptions: {
                type: SchemaType.OBJECT,
                description: "Summary of potential recurring subscription payments identified.",
                properties: {
                    count: {
                        type: SchemaType.INTEGER,
                        description: "Total number of distinct subscription services identified."
                    },
                    total: {
                        type: SchemaType.NUMBER,
                        description: "Total absolute amount spent on identified subscriptions during this period."
                    },
                    totalPercentage: {
                        type: SchemaType.NUMBER,
                        description: "Percentage of total spending attributed to subscriptions (subscriptions total / totalSpend * 100). More common in longer periods."
                    },
                    list: {
                        type: SchemaType.ARRAY,
                        description: "List of identified subscription payments in this period.",
                        items: {
                            type: SchemaType.OBJECT,
                            properties: {
                                name: {
                                    type: SchemaType.STRING,
                                    description: "Inferred name of the subscription service."
                                },
                                amount: {
                                    type: SchemaType.NUMBER,
                                    description: "Amount of the subscription payment (absolute value)."
                                },
                                emoji: {
                                    type: SchemaType.STRING,
                                    description: "A single representative emoji character for this subscription. Required."
                                }
                            },
                            required: [
                                "name",
                                "amount",
                                "emoji"
                            ]
                        }
                    }
                },
                required: [
                    "count",
                    "total",
                    "list"
                ]
            },
            topPurchase: {
                type: SchemaType.OBJECT,
                description: "Details of the largest single debit transaction in the period (relevant for weekly/monthly).",
                properties: {
                    amount: {
                        type: SchemaType.NUMBER,
                        description: "Absolute amount of the largest single purchase."
                    },
                    merchant: {
                        type: SchemaType.STRING,
                        description: "Inferred merchant name for the largest purchase."
                    },
                    emoji: {
                        type: SchemaType.STRING,
                        description: "A single representative emoji character. Required."
                    },
                    description: {
                        type: SchemaType.STRING,
                        description: "Original transaction description for the largest purchase (for context)."
                    },
                    date: {
                        type: SchemaType.STRING,
                        description: "Date of the largest purchase (YYYY-MM-DD)."
                    }
                },
                required: [
                    "amount",
                    "merchant",
                    "date",
                    "emoji"
                ]
            },
            highlight: {
                type: SchemaType.STRING,
                description: "A concise, interesting observation or summary derived from the period's analysis (e.g., $0 spend day, significant purchase, spending trend). Requires interpretation."
            },
            savings: {
                type: SchemaType.NUMBER,
                description: "Estimated net savings during this period (e.g., total credits minus total debits, or specific savings transfers identified). Calculation method needs clarification/inference."
            },
            topCategory: {
                type: SchemaType.OBJECT,
                description: "Highest spending category information (Note: Can be derived from categoryBreakdown).",
                properties: {
                    name: {
                        type: SchemaType.STRING,
                        description: "Name of the top spending category."
                    },
                    amount: {
                        type: SchemaType.NUMBER,
                        description: "Total amount spent in this category."
                    },
                    emoji: {
                        type: SchemaType.STRING,
                        description: "Single emoji representing this category. Required."
                    }
                },
                required: [
                    "name",
                    "amount",
                    "emoji"
                ]
            },
            favoriteStore: {
                type: SchemaType.OBJECT,
                description: "Most frequently visited merchant based on transaction count (Note: Can be derived from topMerchants or transactions).",
                properties: {
                    name: {
                        type: SchemaType.STRING,
                        description: "Name of the most frequented merchant."
                    },
                    visits: {
                        type: SchemaType.INTEGER,
                        description: "Number of visits/transactions."
                    },
                    emoji: {
                        type: SchemaType.STRING,
                        description: "Single emoji representing this merchant. Required."
                    }
                },
                required: [
                    "name",
                    "visits",
                    "emoji"
                ]
            }
        },
        required: [
            "period",
            "totalSpend",
            "currency",
            "transactions",
            "categoryBreakdown",
            "subscriptions"
        ]
    },
};

export class GeminiProcess extends OpenAPIRoute {
    schema = {
        tags: ["Gemini"],
        summary: "Process files with Gemini API",
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
                description: "Gemini API response",
                content: {
                    "application/json": {
                        schema: z.object({
                            success: z.boolean(),
                            result: z.any(), // Response from the Gemini model
                        }),
                    },
                },
            },
        },
    };

    async handle(c) {
        const formData = await c.req.formData();
        const fileEntries = formData.getAll("files");

        if (fileEntries.length === 0) {
            return {
                success: false,
                error: "Missing files",
            };
        }

        try {
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

            // Wait for files to be processed
            for (const file of uploadedFiles) {
                let fileStatus = await fileManager.getFile(file.name);
                while (fileStatus.state === "PROCESSING") {
                    await new Promise((resolve) => setTimeout(resolve, 10000)); // Poll every 10 seconds
                    fileStatus = await fileManager.getFile(file.name);
                }
                if (fileStatus.state !== "ACTIVE") {
                    throw new Error(`File ${file.name} failed to process`);
                }
            }

            // Interact with the Gemini model
            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash",
                systemInstruction: systemPrompt,
            });

            const chatSession = model.startChat({
                generationConfig: generationConfig,
                history: []
            });

            const result = await chatSession.sendMessage(uploadedFiles.map(file => {
                return {
                    fileData: {
                        mimeType: file.mimeType,
                        fileUri: file.uri
                    }
                }
            }));

            return {
                success: true,
                result: JSON.parse(result.response.text()),
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }
}