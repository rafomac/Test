export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto mt-24 max-w-sm rounded-xl border border-line bg-panel p-6">
      <h1 className="text-lg font-semibold">Portfolio Intelligence</h1>
      <p className="mt-1 text-xs text-muted">Private dashboard. Enter your dashboard password (this is not your Zerodha password — never enter that here).</p>
      <form action="/api/auth/login" method="post" className="mt-4 space-y-3">
        <input type="hidden" name="next" value={sp.next ?? "/"} />
        <input type="password" name="password" autoComplete="current-password" required className="w-full" placeholder="Dashboard password" />
        <button className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-white">Sign in</button>
      </form>
    </div>
  );
}
