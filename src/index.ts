import {fromHono} from "chanfana";
import {Hono} from "hono";
import {GeminiStatementsProcess} from "./endpoints/statements";
import {GeminiReflectionsProcess} from "./endpoints/reflections";

// Start a Hono app
const app = new Hono();

// Setup OpenAPI registry
const openapi = fromHono(app, {
	docs_url: "/",
});

// Register OpenAPI endpoints
openapi.post("/api/statements", GeminiStatementsProcess)
openapi.post("/api/reflections", GeminiReflectionsProcess)

// Export the Hono app
export default app;
