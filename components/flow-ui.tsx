import Link from "next/link";
import type { ReactNode } from "react";

const COUNTER_VISIBLE_ROLES = new Set([
  "organisation_owner",
  "organisation_admin",
  "manager",
  "cashier"
]);

export function AppShell({
  title,
  subtitle,
  children,
  role,
  reserveCounterSlot = false
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  role?: string;
  reserveCounterSlot?: boolean;
}) {
  const showCounter = Boolean(role && COUNTER_VISIBLE_ROLES.has(role));
  const showCounterPlaceholder = !showCounter && reserveCounterSlot;

  return (
    <main className="min-h-screen bg-[#f5f2e9] text-[#17211b]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <header className="border-b border-[#d7d2c4] pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <Link
                className="inline-flex min-h-10 items-center text-sm font-semibold uppercase tracking-[0.14em] text-[#5f7056] outline-none transition hover:text-[#17211b] focus-visible:ring-2 focus-visible:ring-[#17211b] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f2e9]"
                href="/app"
              >
                Flow for F&B
              </Link>
              <h1 className="mt-1 text-3xl font-semibold tracking-normal text-[#17211b] sm:text-4xl">
                {title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5f675d]">
                {subtitle}
              </p>
            </div>
          </div>
          <nav
            aria-label="Workspace navigation"
            className="mt-5 grid grid-cols-2 gap-2 text-sm font-semibold sm:flex sm:flex-wrap"
          >
            <NavLink href="/app">Dashboard</NavLink>
            {showCounter && <NavLink href="/app/counter">Counter</NavLink>}
            {showCounterPlaceholder && <CounterNavPlaceholder />}
            <NavLink href="/app/waiter">Floor & Service</NavLink>
            <NavLink href="/app/kitchen">Kitchen</NavLink>
            <NavLink href="/app/connect">Connect</NavLink>
          </nav>
        </header>
        {children}
      </div>
    </main>
  );
}

function CounterNavPlaceholder() {
  return (
    <span
      aria-hidden="true"
      className="flex min-h-11 items-center justify-center border border-[#d7d2c4] bg-[#ece7da] px-4 py-2 shadow-sm"
    >
      <span className="h-3 w-16 bg-[#d7d2c4]" />
    </span>
  );
}

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      className="flex min-h-11 items-center justify-center border border-[#c8c1b1] bg-white px-4 py-2 text-center text-[#263128] shadow-sm outline-none transition hover:border-[#17211b] hover:bg-[#fffdf7] focus-visible:ring-2 focus-visible:ring-[#17211b] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f2e9]"
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
    <section className={`border p-5 shadow-sm ${classes}`}>
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-2 text-sm leading-6">{children}</div>
    </section>
  );
}

export function Badge({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "dark";
}) {
  const classes =
    tone === "success"
      ? "border-[#73936a] bg-[#f0f7ec] text-[#2f542c]"
      : tone === "warning"
        ? "border-[#d6a751] bg-[#fff8e8] text-[#7a4a08]"
        : tone === "danger"
          ? "border-[#d98a76] bg-[#fff1ed] text-[#89321e]"
          : tone === "dark"
            ? "border-[#17211b] bg-[#17211b] text-white"
            : "border-[#c8c1b1] bg-[#faf9f4] text-[#4a5549]";

  return (
    <span
      className={`inline-flex items-center border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${classes}`}
    >
      {children}
    </span>
  );
}

export function Surface({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-[#d7d2c4] bg-white shadow-sm ${className}`}>
      {children}
    </section>
  );
}
