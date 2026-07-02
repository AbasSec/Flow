const baselineItems = [
  "Next.js App Router",
  "Strict TypeScript",
  "Tailwind CSS",
  "ESLint",
  "Vitest"
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#1f2933]">
      <section className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center px-6 py-16">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-[#5f6f52]">
          Milestone 1
        </p>
        <h1 className="text-4xl font-semibold tracking-normal sm:text-5xl">
          Flow - Bootstrap Complete
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-[#4b5563]">
          The repository now has the baseline application shell, quality gates,
          and server/client boundary placeholders required before product
          modules begin.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {baselineItems.map((item) => (
            <div
              className="border border-[#d8dccf] bg-white px-4 py-3 text-sm text-[#374151]"
              key={item}
            >
              {item}
            </div>
          ))}
        </div>
        <p className="mt-8 max-w-2xl text-sm leading-6 text-[#6b7280]">
          No Supabase project, database schema, authentication flow, business
          workflow, payment integration, chat system, inventory module, or
          operational UI has been configured in this milestone.
        </p>
      </section>
    </main>
  );
}
