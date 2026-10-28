import { QrCode, ShoppingCart, Bell, Pencil, ChefHat, BarChart3 } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { FeatureCard } from '@/components/ui/feature-card';

const features = [
  {
    icon: QrCode,
    title: 'Digital QR Menu',
    description: 'Customers scan a QR code and instantly access your restaurant\'s full menu on their phone.'
  },
  {
    icon: ShoppingCart,
    title: 'Table Ordering',
    description: 'Customers can browse, customize, and order directly from their table — no waiting for staff.'
  },
  {
    icon: Bell,
    title: 'Real-Time Orders',
    description: 'Receive and manage incoming orders as they arrive. Never miss an order again.'
  },
  {
    icon: Pencil,
    title: 'Menu Management',
    description: 'Update items, prices, availability, and categories from your dashboard anytime.'
  },
  {
    icon: ChefHat,
    title: 'Kitchen Workflow',
    description: 'Orders move through accepted, preparing, ready, and completed states for your team.'
  },
  {
    icon: BarChart3,
    title: 'Dashboard & Reports',
    description: 'Monitor orders, track activity, and understand your restaurant\'s performance.'
  }
];

export function Features() {
  return (
    <section id="features" className="py-20 bg-surface-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading 
          badge="Features" 
          title="Everything Your Restaurant Needs" 
          className="text-center mb-16"
        />
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 max-w-7xl mx-auto">
          {features.map((feature, index) => (
            <FeatureCard 
              key={index}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
