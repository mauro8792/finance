import express from "express";
import { router } from "./routes/index.js";
import { corsMiddleware } from "./middlewares/cors.js";
import { notFoundHandler } from "./middlewares/not-found.js";
import { errorHandler } from "./middlewares/error-handler.js";

export const app = express();

app.use(corsMiddleware);
app.use(express.json());
app.use(router);
app.use(notFoundHandler);
app.use(errorHandler);
