import { requireAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { createAccount } from '@/app/actions';

export default async function NewAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAuth();
  const { error } = await searchParams;

  async function handleCreate(formData: FormData) {
    'use server';
    const res = await createAccount(
      formData.get('email') as string,
      formData.get('username') as string,
      formData.get('password') as string
    );
    // createAccount redirects to the new player on success; only returns on error.
    if (res?.error) redirect('/players/new?error=' + encodeURIComponent(res.error));
  }

  return (
    <div className="p-8 max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <a href="/players" className="text-blue-400 hover:text-blue-300 text-sm">
          Players
        </a>
        <span className="text-gray-600">/</span>
        <h1 className="text-2xl font-bold text-yellow-400">New Account</h1>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded p-3 mb-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      <section className="bg-gray-900 border border-gray-700 rounded-lg p-6">
        <p className="text-gray-400 text-sm mb-4">
          Creates a user + player with the starter kit equipped — same as in-game
          registration.
        </p>
        <form action={handleCreate} className="flex flex-col gap-4">
          <div>
            <label htmlFor="username" className="block text-sm text-gray-400 mb-1">
              Username
            </label>
            <input id="username" name="username" required className={inputCls} />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm text-gray-400 mb-1">
              Email
            </label>
            <input id="email" name="email" type="email" required className={inputCls} />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm text-gray-400 mb-1">
              Password (min 6 chars)
            </label>
            <input
              id="password"
              name="password"
              type="password"
              minLength={6}
              required
              className={inputCls}
            />
          </div>
          <div>
            <button
              type="submit"
              className="bg-green-700 hover:bg-green-600 text-white px-5 py-2 rounded transition-colors text-sm font-medium"
            >
              Create Account
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

const inputCls =
  'w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm';
