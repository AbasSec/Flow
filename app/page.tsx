import Link from "next/link";

const flowSteps = ["Table order", "Kitchen", "Ready to serve"] as const;

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f5f2e9] text-[#17211b]">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-5 py-12 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#5f7056]">
            Flow for F&B
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-normal sm:text-5xl">
            One operational workspace for table service, kitchen work, and
            accountable handover.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#5f675d]">
            Flow helps Food & Beverage teams keep orders, kitchen status,
            inventory-aware operations, and internal coordination in one
            controlled workspace.
          </p>
          <div className="mt-8">
            <Link
              className="inline-flex min-h-12 items-center justify-center bg-[#17211b] px-5 py-3 text-sm font-semibold text-white outline-none transition hover:bg-[#263128] focus-visible:ring-2 focus-visible:ring-[#17211b] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f2e9]"
              href="/login"
            >
              Staff sign in
            </Link>
          </div>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {flowSteps.map((step, index) => (
            <div
              className="border border-[#d7d2c4] bg-white p-4 shadow-sm"
              key={step}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
                Step {index + 1}
              </p>
              <p className="mt-2 text-lg font-semibold">{step}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 max-w-2xl text-sm leading-6 text-[#667064]">
          Public QR ordering is pay-at-counter table service. No online payment
          gateway is presented from this entry page.
        </p>
      </section>
    </main>
  );
}
