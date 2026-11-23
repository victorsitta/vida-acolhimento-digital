import { DATA_POLICY } from "@/lib/retention";

/** Quadro claro: o que guardamos, quem vê e por quanto tempo. Cartões no celular, tabela no computador. */
export function DataPolicy() {
  return (
    <div>
      <ul className="space-y-3 md:hidden">
        {DATA_POLICY.map((r) => (
          <li key={r.what} className="rounded-2xl border bg-card p-4">
            <p className="text-sm font-semibold">{r.what}</p>
            <dl className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              <div>
                <dt className="font-medium text-foreground">Quem vê</dt>
                <dd>{r.who}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Por quanto tempo</dt>
                <dd>{r.howLong}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Dado</th>
              <th className="px-4 py-3">Quem pode ver</th>
              <th className="px-4 py-3">Por quanto tempo</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {DATA_POLICY.map((r) => (
              <tr key={r.what} className="align-top">
                <td className="px-4 py-3 font-medium">{r.what}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.who}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.howLong}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
