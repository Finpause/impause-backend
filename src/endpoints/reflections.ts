import {OpenAPIRoute} from "chanfana";
import {z} from "zod";
import {GenerationConfig, SchemaType} from "@google/generative-ai";
import {FileMetadataResponse} from "@google/generative-ai/server"
import {fileManager, genAI} from "../utils/gemini";
import {Purchase} from "../types";
import {Context} from "hono";

// Combined schema for the single API call
const combinedConfig: GenerationConfig = {
    temperature: 0.7,
    responseMimeType: "application/json",
    responseSchema: {
        type: SchemaType.ARRAY,
        description: "List of concise and thoughtful reflection prompts",
        items: {
            type: SchemaType.STRING,
        }
    }
};

export class GeminiReflectionsProcess extends OpenAPIRoute {
    schema = {
        tags: ["Gemini"],
        summary: "Generate reflection statements with Gemini",
        request: {
            body: {
                content: {
                    "application/json": {
                        schema: Purchase,
                    },
                },
            },
        },
        responses: {
            "200": {
                description: "Gemini API response with reflection statements",
                content: {
                    "application/json": {
                        schema: z.object({
                            success: z.boolean(),
                            result: z.array(z.string()),
                        }),
                    },
                },
            },
        },
    };

    async handle(c: Context) {
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
            const purchase = await c.req.json<z.infer<typeof Purchase>>()

            // --- Construct the Prompt for Gemini ---
            // The prompt still needs to clearly explain the desired JSON structure.
            let prompt = `
You are a helpful assistant designed to encourage financial mindfulness.
A user is considering the following purchase:

*   **Item:** ${purchase.name}
*   **Price:** $${purchase.price.toFixed(2)}
*   **Category:** ${purchase.category}
*   **Reason given:** "${purchase.reason}"
*   **Self-rated need score:** ${purchase.needScore} out of 10 (10 = highest need)
`;

            // Add optional context
            if (purchase.hourlyWage !== undefined) {
                const hoursToWork = (purchase.price / purchase.hourlyWage).toFixed(1);
                prompt += `*   **User's hourly wage:** $${purchase.hourlyWage.toFixed(2)} (This purchase costs approx. ${hoursToWork} hours of work)\n`;
            }
            if (purchase.savingsGoal) {
                prompt += `*   **Relevant Savings Goal:** "${purchase.savingsGoal.name}" (Current: $${purchase.savingsGoal.current.toFixed(2)}, Target: $${purchase.savingsGoal.target.toFixed(2)})\n`;
            }

            prompt += `
Generate 3 to 5 concise and thoughtful reflection prompts to help the user critically evaluate this potential purchase.
The prompts should encourage thinking about value, necessity, alternatives, long-term impact, and alignment with financial goals (if provided).

**Output Format:** Respond ONLY with a valid JSON array of strings, where each string is a reflection prompt.

Example Output:
["Prompt 1?", "Prompt 2?", "Prompt 3?"]

Ensure the output is *strictly* a JSON array conforming to the schema and nothing else. Do not include markdown formatting (like \`\`\`json).
`;

            // Create a single model instance with the simplified system prompt
            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash",
                generationConfig: combinedConfig
            }, {
                baseUrl: "https://gateway.ai.cloudflare.com/v1/df245a7d10b16486b18246e9eadcdd93/impause/google-ai-studio"
            });

            // Make a single API call to Gemini
            const result = await model.generateContent(prompt);


            return new Response(JSON.stringify({
                success: true,
                result: JSON.parse(result.response.text())
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
