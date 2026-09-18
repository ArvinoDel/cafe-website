import { createClient } from '@supabase/supabase-js';
import Navbar from '@/components/sections/Navbar';
import Hero from '@/components/sections/Hero';
import ValueProposition from '@/components/sections/ValueProposition';
import HowItWorks from '@/components/sections/HowItWorks';
import FeaturedMenu from '@/components/sections/FeaturedMenu';
import Stores from '@/components/sections/Stores';
import LocalRoots from '@/components/sections/LocalRoots';
import Footer from '@/components/sections/Footer';

// Re-validate the homepage immediately on request so content changes from the admin
// panel propagate instantly without delay.
export const revalidate = 0;

type Branch = {
  id: string;
  name: string;
  address: string | null;
  opening_hours?: string | null;
  maps_url?: string | null;
};

async function getBranches(): Promise<Branch[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return [];

  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, address, opening_hours, maps_url')
      .order('created_at');

    if (error) return [];
    return (data as Branch[]) ?? [];
  } catch {
    return [];
  }
}

async function getSiteContent(): Promise<Record<string, any>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return {};

  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from('site_content')
      .select('section, content');

    if (error || !data) return {};
    return data.reduce((acc, row) => {
      acc[row.section] = row.content;
      return acc;
    }, {} as Record<string, any>);
  } catch {
    return {};
  }
}

export default async function Home() {
  const [branches, content] = await Promise.all([
    getBranches(),
    getSiteContent(),
  ]);

  return (
    <>
      <Navbar content={content.navbar} />
      <main>
        <Hero content={content.hero} />
        <ValueProposition content={content.value_proposition} />
        <HowItWorks content={content.how_it_works} />
        <FeaturedMenu />
        <Stores branches={branches} />
        <LocalRoots content={content.local_roots} />
      </main>
      <Footer content={content.footer} />
    </>
  );
}
