import { XCircle, CheckCircle } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';

const problems = [
  'Printed menus become outdated quickly',
  'Staff spend time taking repetitive orders',
  'Orders can be missed or misunderstood',
  'Owners lack a simple operational overview'
];

const solutions = [
  'Update your digital menu instantly from anywhere',
  'Customers order directly from their table',
  'Every order is captured digitally — nothing lost',
  'One dashboard to monitor all restaurant activity'
];

export function ProblemSolution() {
  return (
    <section id="problem-solution" className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading 
          badge="Why Change?" 
          title="Common Problems, Modern Solutions" 
          className="text-center mb-16"
        />
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 max-w-5xl mx-auto">
          {/* Problems */}
          <div className="bg-surface-muted/50 p-8 rounded-3xl border border-border">
            <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                <XCircle className="w-5 h-5" />
              </span>
              The Old Way
            </h3>
            <ul className="space-y-6">
              {problems.map((problem, index) => (
                <li key={index} className="flex gap-4 items-start">
                  <XCircle className="w-6 h-6 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-lg text-muted-foreground">{problem}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Solutions */}
          <div className="bg-surface p-8 rounded-3xl border border-border shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -z-10"></div>
            <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <CheckCircle className="w-5 h-5" />
              </span>
              The Modern Way
            </h3>
            <ul className="space-y-6">
              {solutions.map((solution, index) => (
                <li key={index} className="flex gap-4 items-start">
                  <CheckCircle className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                  <span className="text-lg text-foreground font-medium">{solution}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
