import { Store, QrCode, ScanLine, ClipboardList } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { StepCard } from '@/components/ui/step-card';

const steps = [
  {
    step: 1,
    icon: Store,
    title: 'Add Your Restaurant & Menu',
    description: 'Sign up, create your restaurant profile, and add your menu items with categories and prices.'
  },
  {
    step: 2,
    icon: QrCode,
    title: 'Create Tables & QR Codes',
    description: 'Set up your tables and generate unique QR codes for each one.'
  },
  {
    step: 3,
    icon: ScanLine,
    title: 'Place QR Codes on Tables',
    description: 'Print and place the QR codes on your restaurant tables. Customers scan to see the menu.'
  },
  {
    step: 4,
    icon: ClipboardList,
    title: 'Receive & Manage Orders',
    description: 'Customers scan, browse the menu, and place orders. Your team manages everything from the dashboard.'
  }
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading 
          badge="How It Works" 
          title="Up and Running in Four Simple Steps" 
          className="text-center mb-16"
        />
        
        <div className="relative max-w-7xl mx-auto">
          {/* Connector Line (Desktop) */}
          <div className="hidden lg:block absolute top-[4.5rem] left-0 w-full h-0.5 bg-border -z-10" aria-hidden="true"></div>
          
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {steps.map((step) => (
              <StepCard 
                key={step.step}
                stepNumber={step.step}
                icon={step.icon}
                title={step.title}
                description={step.description}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
