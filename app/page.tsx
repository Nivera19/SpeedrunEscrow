"use client";

import { StoreProvider } from "@/lib/store";
import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Ticker } from "@/components/Ticker";
import { HowItWorks } from "@/components/HowItWorks";
import { Auditor } from "@/components/Auditor";
import { Docket } from "@/components/Docket";
import { Limits } from "@/components/Limits";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <StoreProvider>
      <Nav />
      <main>
        <Hero />
        <Ticker />
        <HowItWorks />
        <Auditor />
        <Docket />
        <Limits />
      </main>
      <Footer />
    </StoreProvider>
  );
}
