import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { documentRouter } from "./documentRouter";
import { bitrix24Router } from "./bitrix24Router";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  document: documentRouter,
  bitrix24: bitrix24Router,
});

export type AppRouter = typeof appRouter;
