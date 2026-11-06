import { TEMPLATES } from "@/lib/import/zerodha";
export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind") ?? "";
  const t = TEMPLATES[kind];
  if (!t) return new Response("Unknown template", { status: 404 });
  return new Response(t, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind}_template.csv"` } });
}
