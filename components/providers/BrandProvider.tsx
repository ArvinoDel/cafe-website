'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';

export type BrandInfo = {
  brandName: string;
  brandSubtitle: string;
};

const DEFAULT_BRAND: BrandInfo = {
  brandName: 'CAFE',
  brandSubtitle: 'Specialty Coffee & Fresh Kitchen',
};

const BrandContext = createContext<BrandInfo>(DEFAULT_BRAND);

export function useBrand(): BrandInfo {
  return useContext(BrandContext);
}

export function BrandProvider({
  initialBrand,
  children,
}: {
  initialBrand?: Partial<BrandInfo>;
  children: React.ReactNode;
}) {
  const [brand, setBrand] = useState<BrandInfo>({
    brandName: initialBrand?.brandName || DEFAULT_BRAND.brandName,
    brandSubtitle: initialBrand?.brandSubtitle || DEFAULT_BRAND.brandSubtitle,
  });

  useEffect(() => {
    // If initialBrand was provided from server, sync it
    if (initialBrand?.brandName) {
      setBrand({
        brandName: initialBrand.brandName,
        brandSubtitle: initialBrand.brandSubtitle || DEFAULT_BRAND.brandSubtitle,
      });
      try {
        localStorage.setItem('cafe-brand-name', initialBrand.brandName);
      } catch {}
      return;
    }

    // Try reading from localStorage first for immediate zero-latency paint
    try {
      const cached = localStorage.getItem('cafe-brand-name');
      if (cached) {
        setBrand((prev) => ({ ...prev, brandName: cached }));
      }
    } catch {}

    // Fetch from Supabase site_content navbar section
    supabase
      .from('site_content')
      .select('content')
      .eq('section', 'navbar')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.content) {
          const content = data.content as Record<string, string>;
          if (content.brandName) {
            setBrand({
              brandName: content.brandName,
              brandSubtitle: content.brandSubtitle || DEFAULT_BRAND.brandSubtitle,
            });
            try {
              localStorage.setItem('cafe-brand-name', content.brandName);
            } catch {}
          }
        }
      });

    const handleBrandChange = () => {
      try {
        const updated = localStorage.getItem('cafe-brand-name');
        if (updated) {
          setBrand((prev) => ({ ...prev, brandName: updated }));
        }
      } catch {}
    };

    window.addEventListener('brandchange', handleBrandChange);
    window.addEventListener('storage', handleBrandChange);

    return () => {
      window.removeEventListener('brandchange', handleBrandChange);
      window.removeEventListener('storage', handleBrandChange);
    };
  }, [initialBrand?.brandName, initialBrand?.brandSubtitle]);

  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}
