import { Navbar } from "@/components/layout/navbar";
import { Hero } from "@/components/marketing/hero";
import { ProblemSolution } from "@/components/marketing/problem-solution";
import { Features } from "@/components/marketing/features";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { ProductPreview } from "@/components/marketing/product-preview";
import { Benefits } from "@/components/marketing/benefits";
import { CtaSection } from "@/components/marketing/cta-section";
import { Footer } from "@/components/layout/footer";
import { getSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSession();
  const isLoggedIn = !!session;

  return (
    <>
      <Navbar isLoggedIn={isLoggedIn} />
      <main>
        <Hero />
        <ProblemSolution />
        <Features />
        <HowItWorks />
        <ProductPreview />
        <Benefits />
        <CtaSection />
      </main>
      <Footer />
    </>
  );
}
