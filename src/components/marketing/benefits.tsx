import { RefreshCw, HandMetal, Eye, Utensils, Settings, Smile } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';

const benefits = [
  {
    icon: RefreshCw,
    title: 'Easier Menu Updates',
    description: 'Change prices, add items, or mark items unavailable — all in real time.'
  },
  {
    icon: HandMetal,
    title: 'Less Manual Order-Taking',
    description: 'Free up your staff to focus on hospitality instead of writing orders.'
  },
  {
    icon: Eye,
    title: 'Centralized Order Visibility',
    description: 'See all incoming and active orders in one place.'
  },
  {
    icon: Utensils,
    title: 'Better Table Workflow',
    description: 'Orders go straight from the table to your kitchen display.'
  },
  {
    icon: Settings,
    title: 'Simpler Operations',
    description: 'One platform to manage menus, tables, orders, and reports.'
  },
  {
    icon: Smile,
    title: 'Better Customer Experience',
    description: 'Customers browse a digital menu and order at their own pace.'
  }
];

export function Benefits() {
  return (
    <section id="benefits" className="py-20 bg-surface-muted">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading 
          badge="Benefits" 
          title="Why Restaurants Choose Our Platform" 
          className="text-center mb-16"
        />
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12 max-w-6xl mx-auto">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <div key={index} className="flex gap-4">
                <div className="shrink-0 mt-1">
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                    <Icon className="w-6 h-6" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    {benefit.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {benefit.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
