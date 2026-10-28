import { UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';

const productLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
];

const companyLinks = [
  { label: 'Contact', href: '/contact' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
];

const accountLinks = [
  { label: 'Login', href: '/login' },
  { label: 'Get Started', href: '/register' },
];

export function Footer() {
  return (
    <footer className="bg-foreground text-white pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12 mb-16">

          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md" aria-label="RestaurantSaaS Home">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <UtensilsCrossed className="w-5 h-5" aria-hidden="true" />
              </div>
              <span className="text-xl font-bold tracking-tight">RestaurantSaaS</span>
            </Link>
            <p className="text-white/60 text-sm leading-relaxed">
              Modern digital menus and table ordering for the next generation of restaurants.
            </p>
          </div>

          {/* Product */}
          <nav aria-label="Product links">
            <h3 className="font-semibold text-sm uppercase tracking-wider mb-4 text-white/80">Product</h3>
            <ul className="space-y-3">
              {productLinks.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-white/60 hover:text-primary transition-colors text-sm">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Company */}
          <nav aria-label="Company links">
            <h3 className="font-semibold text-sm uppercase tracking-wider mb-4 text-white/80">Company</h3>
            <ul className="space-y-3">
              {companyLinks.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-white/60 hover:text-primary transition-colors text-sm">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Account */}
          <nav aria-label="Account links">
            <h3 className="font-semibold text-sm uppercase tracking-wider mb-4 text-white/80">Account</h3>
            <ul className="space-y-3">
              {accountLinks.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-white/60 hover:text-primary transition-colors text-sm">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-white/40 text-sm">
            &copy; {new Date().getFullYear()} RestaurantSaaS. All rights reserved.
          </p>
          <div className="flex gap-6">
            <Link href="/privacy" className="text-white/40 hover:text-white/60 transition-colors text-sm">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-white/40 hover:text-white/60 transition-colors text-sm">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
