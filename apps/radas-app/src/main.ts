import { Application, Router, oakCors, type Context, type Middleware } from "./deps.ts";

// Initialize the application
const app = new Application();
const router = new Router();

// Configure CORS
app.use(oakCors());

// Basic middleware for all requests
app.use(async (ctx: Context, next) => {
  console.log(`${ctx.request.method} ${ctx.request.url.pathname}`);
  await next();
});

// Define routes
router.get("/", (ctx: Context) => {
  ctx.response.body = { message: "Welcome to Radas App API" };
});

router.get("/api/status", (ctx: Context) => {
  ctx.response.body = { 
    status: "ok", 
    version: "1.0.0",
    timestamp: new Date().toISOString()
  };
});

// Use the router
app.use(router.routes());
app.use(router.allowedMethods());

// Start the server
const PORT = parseInt(Deno.env.get("PORT") || "8000");
console.log(`Starting Radas App server on port ${PORT}...`);

// This has to be in a function when we're using TypeScript+VSCode
// but works fine when running with Deno directly
async function startServer() {
  await app.listen({ port: PORT });
}

startServer(); 