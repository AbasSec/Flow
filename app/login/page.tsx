import { signInAction } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#1f2933]">
      <section className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-16">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-[#5f6f52]">
          Flow
        </p>
        <h1 className="text-3xl font-semibold tracking-normal">Sign in</h1>
        <p className="mt-3 text-sm leading-6 text-[#4b5563]">
          Use your authorised Flow workspace email and password.
        </p>
        {params.error ? (
          <p className="mt-5 border border-[#c2410c] bg-[#fff7ed] px-4 py-3 text-sm text-[#9a3412]">
            {params.error}
          </p>
        ) : null}
        <form action={signInAction} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-[#374151]">
            Email
            <input
              autoComplete="email"
              className="mt-2 w-full border border-[#cfd5c5] bg-white px-3 py-2 text-base text-[#111827]"
              name="email"
              required
              type="email"
            />
          </label>
          <label className="block text-sm font-medium text-[#374151]">
            Password
            <input
              autoComplete="current-password"
              className="mt-2 w-full border border-[#cfd5c5] bg-white px-3 py-2 text-base text-[#111827]"
              name="password"
              required
              type="password"
            />
          </label>
          <button
            className="w-full bg-[#1f2933] px-4 py-2.5 text-sm font-semibold text-white"
            type="submit"
          >
            Sign in
          </button>
        </form>
        <p className="mt-5 text-xs leading-5 text-[#6b7280]">
          Access is limited to active organisation members with an authorised
          Flow account.
        </p>
      </section>
    </main>
  );
}
