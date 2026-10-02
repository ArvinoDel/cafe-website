import Navbar from '@/components/sections/Navbar';
import Hero from '@/components/sections/Hero';
import ValueProposition from '@/components/sections/ValueProposition';
import HowItWorks from '@/components/sections/HowItWorks';
import FeaturedMenu from '@/components/sections/FeaturedMenu';
import Stores from '@/components/sections/Stores';
import LocalRoots from '@/components/sections/LocalRoots';
import Footer from '@/components/sections/Footer';
import { getBranches, getSiteContent, getFeaturedItems } from '@/lib/site-data';

// 300s cache TTL with on-demand tag revalidation from admin mutations
export const revalidate = 300;

export default async function Home() {
  const [branches, content, featuredItems] = await Promise.all([
    getBranches(),
    getSiteContent(),
    getFeaturedItems(),
  ]);

  return (
    <>
      <Navbar content={content.navbar} />
      <main>
        <Hero content={content.hero} />
        <ValueProposition content={content.value_proposition} />
        <HowItWorks content={content.how_it_works} />
        <FeaturedMenu items={featuredItems} content={content.featured_menu} />
        <Stores branches={branches} />
        <LocalRoots content={content.local_roots} />
      </main>
      <Footer content={content.footer} />
    </>
  );
}

