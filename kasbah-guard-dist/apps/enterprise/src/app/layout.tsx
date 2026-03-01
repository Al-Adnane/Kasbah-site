import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kasbah Guard Enterprise Dashboard',
  description: 'Manage policies, audit logs, and team settings',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <header className="header">
            <h1>🛡️ Kasbah Guard Enterprise v1.0.0</h1>
            <nav className="nav">
              <a href="/">Dashboard</a>
              <a href="/policies">Policies</a>
              <a href="/audit">Audit Logs</a>
              <a href="/team">Team</a>
              <a href="/ecosystem">Ecosystem</a>
            </nav>
          </header>

          <main className="main">{children}</main>

          <footer className="footer">
            <p>&copy; 2026 Kasbah Guard. All rights reserved. | Privacy-first secret detection.</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
