import { Button } from '@/components/ui/button';
import { QrCode, ShoppingCart, LayoutDashboard, ChefHat } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-background pt-28 pb-16 sm:pt-32 sm:pb-20 lg:pt-40 lg:pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* Copy */}
          <div className="max-w-2xl">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-tight mb-6">
              Turn Every Table Into a{' '}
              <span className="text-primary">Digital Ordering</span>{' '}
              Experience.
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground mb-8 leading-relaxed">
              Empower your customers with instant QR digital menus and seamless table ordering.
              Streamline your kitchen with real-time order management — all from one simple restaurant dashboard.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button href="/register" size="lg">
                Get Started
              </Button>
              <Button href="#how-it-works" variant="outline" size="lg">
                See How It Works
              </Button>
            </div>
          </div>

          {/* Hero Visual — product mockup composition */}
          <div className="relative mx-auto w-full max-w-lg lg:max-w-none" aria-hidden="true">
            <div className="relative w-full aspect-square md:aspect-[4/3] lg:aspect-square">

              {/* Phone Mockup */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[220px] sm:w-[240px] h-[440px] sm:h-[480px] bg-surface rounded-[2.5rem] shadow-2xl border-[8px] border-foreground/10 flex flex-col overflow-hidden z-20">
                <div className="bg-primary p-3 sm:p-4 text-primary-foreground">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-sm">Demo Restaurant</span>
                    <ShoppingCart className="w-4 h-4" />
                  </div>
                  <p className="text-sm font-semibold">Digital Menu</p>
                </div>
                <div className="flex-1 bg-background p-3 space-y-3 overflow-hidden">
                  {['Margherita Pizza', 'Caesar Salad', 'Grilled Chicken'].map((item) => (
                    <div key={item} className="flex gap-3 bg-surface p-3 rounded-xl border border-border shadow-sm">
                      <div className="w-12 h-12 bg-surface-muted rounded-lg flex items-center justify-center shrink-0">
                        <ChefHat className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{item}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Sample item</p>
                        <p className="text-xs font-bold text-primary mt-1">$12.99</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* QR Code Card */}
              <div className="absolute top-8 sm:top-12 lg:top-16 right-2 sm:right-4 lg:right-0 bg-surface p-4 rounded-2xl shadow-xl border border-border z-30">
                <div className="flex flex-col items-center gap-2">
                  <div className="p-3 bg-surface-muted rounded-xl">
                    <QrCode className="w-10 h-10 sm:w-12 sm:h-12 text-foreground" />
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">Table 4</span>
                </div>
              </div>

              {/* Dashboard Card */}
              <div className="absolute bottom-8 sm:bottom-12 lg:bottom-16 left-0 lg:-left-4 bg-surface p-4 sm:p-5 rounded-2xl shadow-xl border border-border z-30 w-56 sm:w-64">
                <div className="flex items-center gap-3 mb-3">
                  <LayoutDashboard className="w-5 h-5 text-primary" />
                  <span className="font-semibold text-sm">Live Orders</span>
                </div>
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Order #1024</span>
                    <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">Preparing</span>
                  </div>
                  <div className="w-full bg-surface-muted rounded-full h-1.5">
                    <div className="bg-primary h-1.5 rounded-full w-2/3 transition-all"></div>
                  </div>
                  <div className="flex justify-between items-center text-xs pt-2 border-t border-border">
                    <span className="text-muted-foreground">Order #1025</span>
                    <span className="text-xs font-medium text-success bg-success/10 px-2 py-0.5 rounded-full">New</span>
                  </div>
                </div>
              </div>

              {/* Background glow */}
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-primary/3 rounded-full blur-3xl -z-10"></div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
