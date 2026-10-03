import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import type { FeaturedMenuItem } from '@/components/sections/FeaturedMenu';

export type Branch = {
  id: string;
  name: string;
  address: string | null;
  opening_hours?: string | null;
  maps_url?: string | null;
};

export type SiteContentMap = Record<string, any>;

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    console.error('[site-data] SUPABASE_SECRET_KEY is missing. Server client cannot be initialized.');
    return null;
  }
  if (!url) {
    console.error('[site-data] NEXT_PUBLIC_SUPABASE_URL is missing.');
    return null;
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function loadSiteContent(): Promise<SiteContentMap> {
  const supabase = getServerClient();
  if (!supabase) return {};
  try {
    const { data, error } = await supabase
      .from('site_content')
      .select('section, content');
    if (error || !data) return {};
    return data.reduce((acc, row) => {
      acc[row.section] = row.content;
      return acc;
    }, {} as SiteContentMap);
  } catch {
    return {};
  }
}

async function loadBranches(): Promise<Branch[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  try {
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

async function loadFeaturedItems(): Promise<FeaturedMenuItem[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('menu_items')
      .select('id, name, description, price, image_url, badge')
      .eq('is_featured', true)
      .eq('is_available', true)
      .order('sort_order', { ascending: true })
      .limit(8);
    if (error) return [];
    return (data as FeaturedMenuItem[]) ?? [];
  } catch {
    return [];
  }
}

// ─── Cached loaders (300s TTL + on-demand tag revalidation) ───────────────────

export const getSiteContent = unstable_cache(
  loadSiteContent,
  ['site-content'],
  { tags: ['site-content'], revalidate: 300 },
);

export const getBranches = unstable_cache(
  loadBranches,
  ['branches'],
  { tags: ['branches'], revalidate: 300 },
);

export const getFeaturedItems = unstable_cache(
  loadFeaturedItems,
  ['featured-menu'],
  { tags: ['menu'], revalidate: 300 },
);

export type SitePage = {
  id: string;
  slug: string;
  title: string;
  content: string;
  is_published: boolean;
  updated_at: string;
};

async function loadSitePage(slug: string): Promise<SitePage | null> {
  const supabase = getServerClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('site_pages')
      .select('id, slug, title, content, is_published, updated_at')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle();
    if (error || !data) return null;
    return data as SitePage;
  } catch {
    return null;
  }
}

async function loadAllSitePages(): Promise<SitePage[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('site_pages')
      .select('id, slug, title, content, is_published, updated_at')
      .order('updated_at', { ascending: false });
    if (error || !data) return [];
    return data as SitePage[];
  } catch {
    return [];
  }
}

export const getSitePage = (slug: string) =>
  unstable_cache(
    () => loadSitePage(slug),
    [`site-page-${slug}`],
    { tags: ['site-pages', `site-page-${slug}`], revalidate: 300 },
  )();

export const getAllSitePages = unstable_cache(
  loadAllSitePages,
  ['site-pages-all'],
  { tags: ['site-pages'], revalidate: 300 },
);
