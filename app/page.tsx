import Navbar from '@/components/sections/Navbar';
import Hero from '@/components/sections/Hero';
import ValueProposition from '@/components/sections/ValueProposition';
import AppPromo from '@/components/sections/AppPromo';
import FeaturedMenu from '@/components/sections/FeaturedMenu';
import Stores from '@/components/sections/Stores';
import Sustainability from '@/components/sections/Sustainability';
import Footer from '@/components/sections/Footer';

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <ValueProposition />
        <AppPromo />
        <FeaturedMenu />
        <Stores />
        <Sustainability />
      </main>
      <Footer />
    </>
  );
}
