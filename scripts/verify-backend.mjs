import { readFileSync } from "node:fs";
const config = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => {
      const n = line.indexOf("=");
      return [line.slice(0, n), line.slice(n + 1)];
    }),
);
const response = await fetch(
  `${config.VITE_SUPABASE_URL}/rest/v1/profiles?select=id&limit=0`,
  {
    headers: {
      apikey: config.VITE_SUPABASE_ANON_KEY,
      "Accept-Profile": config.VITE_SUPABASE_SCHEMA,
    },
  },
);
const body = await response.json();
console.log(
  JSON.stringify({
    status: response.status,
    code: body.code,
    message: body.message,
    anonymousRows: Array.isArray(body) ? body.length : undefined,
  }),
);
const edge = await fetch(
  `${config.VITE_SUPABASE_URL}/functions/v1/controlgps-invite-employee`,
  {
    method: "POST",
    headers: {
      apikey: config.VITE_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
    },
    body: "{}",
  },
);
const edgeBody = await edge.json();
console.log(
  JSON.stringify({
    endpoint: "controlgps-invite-employee",
    unauthenticatedStatus: edge.status,
    message: edgeBody.message,
  }),
);
if (response.status !== 401 || edge.status !== 401) process.exitCode = 1;
