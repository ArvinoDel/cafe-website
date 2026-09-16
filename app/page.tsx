import Navbar from '@/components/sections/Navbar';
import Hero from '@/components/sections/Hero';
import ValueProposition from '@/components/sections/ValueProposition';
import HowItWorks from '@/components/sections/HowItWorks';
import FeaturedMenu from '@/components/sections/FeaturedMenu';
import Stores from '@/components/sections/Stores';
import LocalRoots from '@/components/sections/LocalRoots';
import Footer from '@/components/sections/Footer';

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <ValueProposition />
        <HowItWorks />
        <FeaturedMenu />
        <Stores />
        <LocalRoots />
      </main>
      <Footer />
    </>
  );
}
