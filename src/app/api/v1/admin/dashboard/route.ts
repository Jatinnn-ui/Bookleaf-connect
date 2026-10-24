import { json, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/session";
import { adminDashboard } from "@/server/tickets";

export const GET = route(async () => {
  await requireAdmin();
  return json(await adminDashboard());
});
