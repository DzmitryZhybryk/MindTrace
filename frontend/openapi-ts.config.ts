import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "../backend/openapi.json",
  output: "src/api/generated",
  plugins: [
    "@hey-api/client-fetch",
    "zod",
    "@tanstack/react-query",
    {
      name: "@hey-api/sdk",
      validator: "zod",
      responseStyle: "data",
      throwOnError: true,
    },
  ],
});
