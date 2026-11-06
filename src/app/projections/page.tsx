import { pageCtx } from "@/lib/server/page";
import { PageHeader } from "@/components/ui";
import { Projections } from "@/components/Projections";

export default function Page() {
  const { a, s, nf } = pageCtx();
  const live = a.summary.totalPortfolio;
  return (
    <>
      <PageHeader title="Wealth Projections" subtitle="Interactive compounding simulator. Starting value defaults to your actual portfolio value (securities + cash)." />
      <Projections startValue={live || 1_300_000} monthly={s.monthlyTarget} milestones={s.milestones} nf={nf} valueSource={live ? `actual ${a.asOf}` : "no data — using your ₹13 L estimate"} />
    </>
  );
}
