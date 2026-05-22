export type Route =
  | "overview"
  | "accounts"
  | "sessions"
  | "relay"
  | "plugins"
  | "customInstructions"
  | "mcp"
  | "skills"
  | "admin"
  | "maintenance"
  | "settings";

export const ALL_APP_ROUTES: Route[] = [
  "overview",
  "accounts",
  "sessions",
  "relay",
  "plugins",
  "customInstructions",
  "mcp",
  "skills",
  "admin",
  "maintenance",
  "settings",
];

export function isAppRoute(value: string): value is Route {
  return (ALL_APP_ROUTES as string[]).includes(value);
}
