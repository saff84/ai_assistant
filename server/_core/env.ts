export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  devMode: process.env.DEV_MODE === "true",
  devAdminEmail: process.env.DEV_ADMIN_EMAIL ?? "admin@localhost",
  devAdminName: process.env.DEV_ADMIN_NAME ?? "Admin User",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "mistral",
  authDisabled:
    process.env.DISABLE_AUTH === "true" ||
    process.env.VITE_DISABLE_AUTH === "true",
};
