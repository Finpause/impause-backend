import {fromHono} from "chanfana";
import {Hono} from "hono";
import {GeminiProcess} from "./endpoints/gemini";

// Start a Hono app
const app = new Hono();

// Setup OpenAPI registry
const openapi = fromHono(app, {
	docs_url: "/",
});

// Register OpenAPI endpoints
openapi.post("/api/gemini", GeminiProcess)

// Export the Hono app
export default app;
