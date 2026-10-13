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
const response = await fetch(config.VITE_SUPABASE_URL + "/auth/v1/settings", {
  headers: { apikey: config.VITE_SUPABASE_ANON_KEY },
});
const settings = await response.json();
console.log(
  JSON.stringify({
    status: response.status,
    disableSignup: settings.disable_signup,
    emailEnabled: settings.external?.email,
    autoConfirm: settings.mailer_autoconfirm,
  }),
);
