import { Button } from '@/components/ui/button';

export function CtaSection() {
  return (
    <section className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-secondary rounded-2xl md:rounded-3xl p-10 md:p-16 lg:p-20 text-center shadow-2xl relative overflow-hidden max-w-6xl mx-auto">

          {/* Decorative background */}
          <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" aria-hidden="true"></div>
          <div className="absolute bottom-0 left-0 translate-y-1/3 -translate-x-1/3 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true"></div>

          <div className="relative z-10 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-secondary-foreground mb-6">
              Ready to Modernize Your Restaurant Ordering?
            </h2>
            <p className="text-lg md:text-xl text-secondary-foreground/80 mb-10 leading-relaxed">
              Join restaurants that are simplifying operations with digital menus and QR ordering.
            </p>
            <Button
              href="/register"
              size="lg"
              className="bg-white text-secondary hover:bg-white/90 text-lg px-10 h-14 rounded-full font-semibold inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-secondary"
            >
              Get Started
            </Button>
          </div>

        </div>
      </div>
    </section>
  );
}
