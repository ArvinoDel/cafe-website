/**
 * lib/page-content.ts
 *
 * Utilities for resolving site page placeholders and processing markdown content.
 *
 * Rules:
 *  - Replace placeholders from existing site settings:
 *    {{cafe_name}}, {{contact_email}}, {{contact_phone}}, {{address}},
 *    {{opening_hours}}, {{whatsapp}}, {{instagram}}.
 *  - If a value is empty, hide that line instead of showing the raw placeholder.
 *  - No brand-specific strings.
 */

import { DEFAULT_BRAND } from '@/lib/site-defaults';
import type { Branch, SiteContentMap } from '@/lib/site-data';

export type SitePlaceholders = {
  cafe_name: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  opening_hours: string;
  whatsapp: string;
  instagram: string;
};

/**
 * Extract active placeholders from loaded site_content and branches.
 */
export function extractSitePlaceholders(
  contentMap: SiteContentMap = {},
  branches: Branch[] = [],
): SitePlaceholders {
  const navbar = contentMap.navbar || {};
  const theme = contentMap.theme || {};
  const footer = contentMap.footer || {};
  const contact = contentMap.contact || {};
  const primaryBranch = branches[0] || null;

  // Resolve cafe name
  const cafe_name =
    navbar.brandName ||
    theme.brandName ||
    footer.brandName ||
    DEFAULT_BRAND.brandName ||
    '';

  // Resolve socials
  const socials: { platform?: string; href?: string; label?: string }[] =
    Array.isArray(footer.socials) ? footer.socials : [];

  const igSocial = socials.find(
    (s) => s.platform && s.platform.toLowerCase() === 'instagram',
  );
  const waSocial = socials.find(
    (s) => s.platform && s.platform.toLowerCase() === 'whatsapp',
  );

  // Resolve instagram: handle or link
  const instagram =
    igSocial?.href?.trim() ||
    footer.instagram?.trim() ||
    contact.instagram?.trim() ||
    '';

  // Resolve whatsapp: link or number
  const whatsapp =
    waSocial?.href?.trim() ||
    footer.whatsapp?.trim() ||
    contact.whatsapp?.trim() ||
    '';

  // Resolve address
  const address =
    primaryBranch?.address?.trim() ||
    contact.address?.trim() ||
    footer.address?.trim() ||
    '';

  // Resolve opening hours
  const opening_hours =
    primaryBranch?.opening_hours?.trim() ||
    contact.opening_hours?.trim() ||
    footer.opening_hours?.trim() ||
    '';

  // Resolve contact email
  const contact_email =
    footer.contactEmail?.trim() ||
    contact.email?.trim() ||
    contact.contact_email?.trim() ||
    process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ||
    '';

  // Resolve contact phone
  const contact_phone =
    (primaryBranch as any)?.phone?.trim() ||
    footer.contactPhone?.trim() ||
    contact.phone?.trim() ||
    contact.contact_phone?.trim() ||
    process.env.NEXT_PUBLIC_CONTACT_PHONE?.trim() ||
    '';

  return {
    cafe_name: String(cafe_name).trim(),
    contact_email: String(contact_email).trim(),
    contact_phone: String(contact_phone).trim(),
    address: String(address).trim(),
    opening_hours: String(opening_hours).trim(),
    whatsapp: String(whatsapp).trim(),
    instagram: String(instagram).trim(),
  };
}

/**
 * Replace placeholders in markdown text according to site settings.
 * If a placeholder's value is empty, the containing line is hidden.
 */
export function resolvePlaceholders(
  rawContent: string,
  placeholders: SitePlaceholders,
): string {
  if (!rawContent) return '';

  const placeholderKeys = Object.keys(placeholders) as (keyof SitePlaceholders)[];
  const lines = rawContent.split(/\r?\n/);
  const processedLines: string[] = [];

  for (const line of lines) {
    // Check if line contains any placeholders (e.g. {{key}})
    const matches = Array.from(line.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g));

    if (matches.length === 0) {
      processedLines.push(line);
      continue;
    }

    // Special compound handling: lines containing ' · ' (bullet separators)
    // e.g. **Contact:** {{contact_email}} · {{contact_phone}} · WhatsApp {{whatsapp}}
    if (line.includes(' · ')) {
      // Check if there's a prefix label like **Contact:**
      const prefixMatch = line.match(/^(\*\*[^*]+:\*\*\s*)(.*)$/);
      const prefix = prefixMatch ? prefixMatch[1] : '';
      const rest = prefixMatch ? prefixMatch[2] : line;

      const segments = rest.split(' · ');
      const validSegments: string[] = [];

      for (const seg of segments) {
        let segText = seg;
        let hasEmptyPlaceholder = false;
        const segMatches = Array.from(seg.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g));

        for (const m of segMatches) {
          const key = m[1] as keyof SitePlaceholders;
          const val = placeholders[key];
          if (!val || val.trim() === '') {
            hasEmptyPlaceholder = true;
            break;
          }
          segText = segText.split(m[0]).join(val);
        }

        if (!hasEmptyPlaceholder && segText.trim() !== '') {
          validSegments.push(segText.trim());
        }
      }

      if (validSegments.length > 0) {
        processedLines.push(prefix + validSegments.join(' · '));
      }
      // If no valid segments remain, this entire line is dropped (hidden)
      continue;
    }

    // Standard line with placeholders
    let shouldHideLine = false;
    let resolvedLine = line;

    for (const match of matches) {
      const fullTag = match[0];
      const key = match[1] as keyof SitePlaceholders;
      const value = placeholders[key];

      // If any placeholder on this line is missing or empty, hide the entire line
      if (!value || value.trim() === '') {
        shouldHideLine = true;
        break;
      }

      resolvedLine = resolvedLine.split(fullTag).join(value);
    }

    if (!shouldHideLine) {
      processedLines.push(resolvedLine);
    }
  }

  // Join lines and clean up excessive trailing/consecutive blank lines
  return processedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
