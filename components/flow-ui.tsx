import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f6f4ed] text-[#17211b]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-[#d7d2c4] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              className="text-sm font-semibold uppercase tracking-[0.16em] text-[#66785f]"
              href="/app"
            >
              Flow for F&B
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-[#17211b]">
              {title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5f675d]">
              {subtitle}
            </p>
          </div>
          <nav className="flex flex-wrap gap-2 text-sm font-semibold">
            <NavLink href="/app">Dashboard</NavLink>
            <NavLink href="/app/waiter">Waiter</NavLink>
            <NavLink href="/app/kitchen">Kitchen</NavLink>
            <NavLink href="/app/connect">Connect</NavLink>
          </nav>
        </header>
        {children}
      </div>
    </main>
  );
}

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      className="border border-[#c8c1b1] bg-white px-3 py-2 text-[#263128] transition hover:border-[#17211b]"
      href={href}
    >
      {children}
    </Link>
  );
}

export function StatePanel({
  title,
  children,
  tone = "neutral"
}: {
  title: string;
  children: ReactNode;
  tone?: "neutral" | "error" | "forbidden";
}) {
  const classes =
    tone === "error"
      ? "border-[#c2410c] bg-[#fff7ed] text-[#7c2d12]"
      : tone === "forbidden"
        ? "border-[#9f1239] bg-[#fff1f2] text-[#881337]"
        : "border-[#d7d2c4] bg-white text-[#344033]";

  return (
    <section className={`border p-5 ${classes}`}>
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-2 text-sm leading-6">{children}</div>
    </section>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex border border-[#c8c1b1] bg-[#faf9f4] px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#4a5549]">
      {children}
    </span>
  );
}
