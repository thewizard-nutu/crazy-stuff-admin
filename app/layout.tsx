import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { logoutAction } from './actions';
import { cookies } from 'next/headers';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Crazy Stuff Admin',
  description: 'Admin dashboard for Crazy Stuff game',
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const isLoggedIn = !!cookieStore.get('admin_token')?.value;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-950 text-gray-100">
        {isLoggedIn && (
          <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-6">
            <span className="text-yellow-400 font-bold text-lg mr-4">
              Crazy Stuff Admin
            </span>
            <a
              href="/"
              className="text-blue-400 hover:text-blue-300 transition-colors text-sm"
            >
              Dashboard
            </a>
            <a
              href="/players"
              className="text-blue-400 hover:text-blue-300 transition-colors text-sm"
            >
              Players
            </a>
            <a
              href="/items"
              className="text-blue-400 hover:text-blue-300 transition-colors text-sm"
            >
              Items
            </a>
            <a
              href="/store"
              className="text-blue-400 hover:text-blue-300 transition-colors text-sm"
            >
              Coin Shop
            </a>
            <form action={logoutAction} className="ml-auto">
              <button
                type="submit"
                className="text-gray-400 hover:text-red-400 transition-colors text-sm"
              >
                Logout
              </button>
            </form>
          </nav>
        )}
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
