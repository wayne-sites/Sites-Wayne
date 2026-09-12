import { getCurrentUser } from "@/lib/supabase/auth";
import { loadWayne } from "@/lib/server/wayne-store";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: "Autenticação necessária" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const { vault } = await loadWayne(user.id);
    const text =
      "# Vault Nexus — últimos 50 registros\n\n" +
      vault
        .map(
          (e) =>
            `<!-- ${e.file_path} | sha256:${e.sha256} -->\n# ${e.titulo}\n\n${e.conteudo}\n`,
        )
        .join("\n\n---\n\n");
    return new Response(text, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'attachment; filename="nexus-wayne-vault.md"',
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "Vault indisponível" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
