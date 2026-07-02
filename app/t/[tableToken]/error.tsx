"use client";

export default function PublicTableError() {
  return (
    <main className="min-h-screen bg-[#f6f4ed] px-4 py-5 text-[#17211b]">
      <section className="mx-auto mt-24 max-w-xl border border-[#d8d1c1] bg-white p-5">
        <h1 className="text-2xl font-semibold">Ordering unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-[#60685f]">
          We could not load this table menu. Please ask the counter for help.
        </p>
      </section>
    </main>
  );
}
