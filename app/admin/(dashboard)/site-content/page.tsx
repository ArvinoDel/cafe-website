'use client';

import { useEffect, useState, useCallback, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Palette,
  Layout,
  Star,
  BookOpen,
  Footprints,
  Navigation,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Upload,
  X,
  Info,
  Search,
  Plus,
  Trash2,
  Download,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-client';
import { useAdminProfile } from '../../AdminShell';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

// ─── Supabase client ──────────────────────────────────────────────────────────

function getSupabase() {
  return getSupabaseBrowserClient();
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SectionKey = 'navbar' | 'hero' | 'value_proposition' | 'how_it_works' | 'featured_menu' | 'local_roots' | 'footer' | 'theme' | 'seo';

type SectionDef = {
  key: SectionKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
};

const SECTIONS: SectionDef[] = [
  { key: 'theme',            label: 'Branding & Theme',  icon: Palette,    description: 'Color palette, brand name, and logo' },
  { key: 'seo',             label: 'SEO & Metadata',    icon: Search,     description: 'Page title, meta description, and OG image' },
  { key: 'navbar',           label: 'Navigation',        icon: Navigation, description: 'Brand name, subtitle, and nav links' },
  { key: 'hero',             label: 'Hero Section',      icon: Layout,     description: 'Main headline, subheadline, CTA, and hero image' },
  { key: 'value_proposition',label: 'Value Proposition', icon: Star,       description: 'Why choose us — feature cards' },
  { key: 'how_it_works',     label: 'How It Works',      icon: BookOpen,   description: 'Steps, title, and description' },
  { key: 'featured_menu',    label: 'Featured Menu',     icon: Star,       description: 'Section eyebrow, title, and "see all" link copy' },
  { key: 'local_roots',      label: 'Our Story',         icon: Footprints, description: 'Origin story, commitments, and story image' },
  { key: 'footer',           label: 'Footer',            icon: Footprints, description: 'Tagline, social links, and newsletter copy' },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">{children}</label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const cls =
    'w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors';
  if (multiline)
    return (
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cls + ' resize-none'}
      />
    );
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cls}
    />
  );
}

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded-xl border border-coffee-100 cursor-pointer"
        />
        <Input value={value} onChange={onChange} placeholder="#6b4122" />
      </div>
    </div>
  );
}

// ─── Save feedback toast ──────────────────────────────────────────────────────

function SaveToast({ state }: { state: 'saving' | 'success' | 'error' | null }) {
  if (!state) return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-soft-xl text-sm font-semibold ${
          state === 'saving'
            ? 'bg-white border border-coffee-100 text-coffee-700'
            : state === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}
      >
        {state === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
        {state === 'success' && <CheckCircle2 className="w-4 h-4" />}
        {state === 'error'   && <AlertCircle  className="w-4 h-4" />}
        {state === 'saving'  ? 'Saving...'  : state === 'success' ? 'Saved!' : 'Save failed'}
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Image uploader ───────────────────────────────────────────────────────────

function ImageUploader({
  label,
  currentUrl,
  onUrlChange,
}: {
  label: string;
  currentUrl: string;
  onUrlChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);

    const supabase = getSupabase();
    const ext = file.name.split('.').pop();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage.from('site-images').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (error) {
      setUploadError(error.message);
    } else {
      const { data } = supabase.storage.from('site-images').getPublicUrl(path);
      onUrlChange(data.publicUrl);
    }
    setUploading(false);
  }

  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-col gap-2">
        <Input value={currentUrl} onChange={onUrlChange} placeholder="https://..." />
        <label className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-coffee-200 text-coffee-600 text-sm font-medium hover:border-coffee-400 hover:bg-coffee-50 transition-all cursor-pointer">
          {uploading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
          ) : (
            <><Upload className="w-4 h-4" /> Upload image</>
          )}
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
        </label>
        {uploadError && (
          <p className="text-xs text-red-600">{uploadError}</p>
        )}
        {currentUrl && (
          <img
            src={currentUrl}
            alt="Preview"
            className="mt-1 rounded-xl object-cover w-full max-h-40 border border-coffee-100"
          />
        )}
      </div>
    </div>
  );
}

// ─── Section editors ──────────────────────────────────────────────────────────

function ThemeEditor({ content, onChange }: { content: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const field = (key: string, label: string) => (
    <ColorPicker
      key={key}
      label={label}
      value={content[key] ?? '#000000'}
      onChange={(v) => onChange({ ...content, [key]: v })}
    />
  );

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-xl bg-coffee-50 border border-coffee-100 flex gap-2">
        <Info className="w-4 h-4 text-coffee-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-charcoal/60 leading-relaxed">
          These colors update the entire site immediately. Changes are applied via CSS custom properties, so no rebuild is needed.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {field('primary',    'Primary (buttons, accents)')}
        {field('secondary',  'Secondary (soft highlights)')}
        {field('background', 'Page Background')}
        {field('foreground', 'Body Text')}
        {field('accent',     'Accent (hover backgrounds)')}
        {field('card',       'Card Background')}
        {field('muted',      'Muted Background')}
      </div>

      {/* Live preview */}
      <div className="mt-4">
        <p className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide mb-3">Preview</p>
        <div
          className="rounded-2xl border border-coffee-100 p-6 space-y-4"
          style={{ backgroundColor: content.background ?? '#faf6f2' }}
        >
          <div
            className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: content.primary ?? '#6b4122' }}
          >
            Primary Button
          </div>
          <div
            className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold ml-2"
            style={{ backgroundColor: content.accent ?? '#f0dcc0', color: content.foreground ?? '#2a1f17' }}
          >
            Accent Element
          </div>
          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: content.card ?? '#ffffff' }}
          >
            <p className="text-sm font-bold" style={{ color: content.foreground ?? '#2a1f17' }}>
              Card with body text
            </p>
            <p className="text-sm mt-1" style={{ color: content.muted ?? '#f1e8de' }}>
              Muted text sample
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavbarEditor({ content, onChange }: { content: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Brand Name</Label>
        <Input value={(content.brandName as string) ?? ''} onChange={(v) => onChange({ ...content, brandName: v })} placeholder="CAFE" />
      </div>
      <div>
        <Label>Brand Subtitle</Label>
        <Input value={(content.brandSubtitle as string) ?? ''} onChange={(v) => onChange({ ...content, brandSubtitle: v })} placeholder="Specialty Coffee" />
      </div>
      <div>
        <Label>CTA Button Label</Label>
        <Input value={(content.ctaLabel as string) ?? ''} onChange={(v) => onChange({ ...content, ctaLabel: v })} placeholder="Scan to Order" />
      </div>
    </div>
  );
}

function HeroEditor({ content, onChange }: { content: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const sp = (content.socialProof as Record<string, unknown>) ?? {};

  function updateSp(key: string, value: unknown) {
    onChange({ ...content, socialProof: { ...sp, [key]: value } });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Badge Text</Label>
        <Input value={(content.badge as string) ?? ''} onChange={(v) => onChange({ ...content, badge: v })} placeholder="Scan the QR at your table — order without the queue" />
      </div>
      <div>
        <Label>Headline</Label>
        <Input value={(content.headline as string) ?? ''} onChange={(v) => onChange({ ...content, headline: v })} placeholder="Artisan Coffee" />
      </div>
      <div>
        <Label>Headline Accent (highlighted line)</Label>
        <Input value={(content.headlineAccent as string) ?? ''} onChange={(v) => onChange({ ...content, headlineAccent: v })} placeholder="&amp; Fresh Kitchen." />
      </div>
      <div>
        <Label>Subheadline</Label>
        <Input value={(content.subheadline as string) ?? ''} onChange={(v) => onChange({ ...content, subheadline: v })} placeholder="Great coffee and fresh food delivered to your seat." multiline />
      </div>
      <div>
        <Label>Primary CTA Label</Label>
        <Input value={((content.primaryCta as { label: string })?.label) ?? ''} onChange={(v) => onChange({ ...content, primaryCta: { ...(content.primaryCta as object ?? {}), label: v } })} placeholder="View Menu" />
      </div>
      <div>
        <Label>Secondary CTA Label</Label>
        <Input value={((content.secondaryCta as { label: string })?.label) ?? ''} onChange={(v) => onChange({ ...content, secondaryCta: { ...(content.secondaryCta as object ?? {}), label: v } })} placeholder="How It Works" />
      </div>
      <ImageUploader
        label="Hero Image"
        currentUrl={(content.heroImageUrl as string) ?? ''}
        onUrlChange={(url) => onChange({ ...content, heroImageUrl: url })}
      />
      <div>
        <Label>Hero Image Alt Text</Label>
        <Input value={(content.heroImageAlt as string) ?? ''} onChange={(v) => onChange({ ...content, heroImageAlt: v })} placeholder="Freshly brewed specialty coffee" />
      </div>

      {/* Social Proof (opt-in) */}
      <div className="border-t border-coffee-100 pt-4 space-y-3">
        <p className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide">Social Proof</p>
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!sp.enabled}
            onChange={(e) => updateSp('enabled', e.target.checked)}
            className="w-4 h-4 rounded accent-coffee-700"
          />
          <span className="text-sm font-semibold text-coffee-900">Tampilkan blok social proof</span>
        </label>
        {!!sp.enabled && (
          <div className="space-y-3 pl-6 border-l-2 border-coffee-100">
            <div className="p-3 rounded-xl bg-coffee-50 border border-coffee-100 flex gap-2">
              <Info className="w-4 h-4 text-coffee-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-charcoal/60">Isi dengan angka nyata, bukan perkiraan. Tidak ada default — kolom kosong tidak akan ditampilkan.</p>
            </div>
            <div>
              <Label>Customers Title</Label>
              <Input value={(sp.customersTitle as string) ?? ''} onChange={(v) => updateSp('customersTitle', v)} placeholder="Pelanggan puas" />
            </div>
            <div>
              <Label>Customers Subtitle</Label>
              <Input value={(sp.customersSubtitle as string) ?? ''} onChange={(v) => updateSp('customersSubtitle', v)} placeholder="di setiap kunjungan" />
            </div>
            <div>
              <Label>Rating Value (e.g. 4.8)</Label>
              <Input value={(sp.ratingValue as string) ?? ''} onChange={(v) => updateSp('ratingValue', v)} placeholder="" />
            </div>
            <div>
              <Label>Rating Title</Label>
              <Input value={(sp.ratingTitle as string) ?? ''} onChange={(v) => updateSp('ratingTitle', v)} placeholder="Rating pelanggan" />
            </div>
            <div>
              <Label>Rating Subtitle</Label>
              <Input value={(sp.ratingSubtitle as string) ?? ''} onChange={(v) => updateSp('ratingSubtitle', v)} placeholder="disukai pelanggan tetap" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ValuePropositionEditor({ content, onChange }: { content: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const features = (content.features as { icon: string; title: string; description: string }[]) ?? [];

  function updateFeature(i: number, key: string, value: string) {
    const updated = features.map((f, idx) => idx === i ? { ...f, [key]: value } : f);
    onChange({ ...content, features: updated });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Tag Line</Label>
        <Input value={(content.tag as string) ?? ''} onChange={(v) => onChange({ ...content, tag: v })} placeholder="Why Choose Us" />
      </div>
      <div>
        <Label>Section Title</Label>
        <Input value={(content.title as string) ?? ''} onChange={(v) => onChange({ ...content, title: v })} placeholder="Great coffee, made easy" />
      </div>
      <div>
        <Label>Section Description</Label>
        <Input value={(content.description as string) ?? ''} onChange={(v) => onChange({ ...content, description: v })} multiline />
      </div>
      <div className="space-y-4">
        <p className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide">Feature Cards</p>
        {features.map((f, i) => (
          <div key={i} className="p-4 rounded-xl bg-coffee-50 border border-coffee-100 space-y-3">
            <p className="text-xs font-bold text-coffee-700">Card {i + 1}</p>
            <div>
              <Label>Title</Label>
              <Input value={f.title} onChange={(v) => updateFeature(i, 'title', v)} />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={f.description} onChange={(v) => updateFeature(i, 'description', v)} multiline />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HowItWorksEditor({ content, onChange }: { content: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const steps  = (content.steps  as { num: string; title: string; desc: string }[]) ?? [];
  const mockup = (content.mockup as Record<string, string>) ?? {};

  function updateStep(i: number, key: string, value: string) {
    const updated = steps.map((s, idx) => idx === i ? { ...s, [key]: value } : s);
    onChange({ ...content, steps: updated });
  }

  function updateMockup(key: string, value: string) {
    onChange({ ...content, mockup: { ...mockup, [key]: value } });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Tag Line</Label>
        <Input value={(content.tag as string) ?? ''} onChange={(v) => onChange({ ...content, tag: v })} placeholder="How It Works" />
      </div>
      <div>
        <Label>Section Title</Label>
        <Input value={(content.title as string) ?? ''} onChange={(v) => onChange({ ...content, title: v })} placeholder="Three steps," />
      </div>
      <div>
        <Label>Section Title Accent</Label>
        <Input value={(content.titleAccent as string) ?? ''} onChange={(v) => onChange({ ...content, titleAccent: v })} placeholder="coffee without the wait." />
      </div>
      <div>
        <Label>Description</Label>
        <Input value={(content.description as string) ?? ''} onChange={(v) => onChange({ ...content, description: v })} multiline />
      </div>
      <div className="space-y-4">
        <p className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide">Steps</p>
        {steps.map((s, i) => (
          <div key={i} className="p-4 rounded-xl bg-coffee-50 border border-coffee-100 space-y-3">
            <p className="text-xs font-bold text-coffee-700">Step {s.num}</p>
            <div>
              <Label>Title</Label>
              <Input value={s.title} onChange={(v) => updateStep(i, 'title', v)} />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={s.desc} onChange={(v) => updateStep(i, 'desc', v)} multiline />
            </div>
          </div>
        ))}
      </div>

      {/* Phone mockup item */}
      <div className="border-t border-coffee-100 pt-4 space-y-3">
        <p className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide">Phone Mockup Item</p>
        <p className="text-xs text-charcoal/50">The example item shown inside the phone illustration.</p>
        <div>
          <Label>Item Name</Label>
          <Input value={mockup.itemName ?? ''} onChange={(v) => updateMockup('itemName', v)} placeholder="Es Kopi Susu" />
        </div>
        <div>
          <Label>Item Price (e.g. Rp 25.000)</Label>
          <Input value={mockup.itemPrice ?? ''} onChange={(v) => updateMockup('itemPrice', v)} placeholder="Rp 25.000" />
        </div>
        <div>
          <Label>Item Note / Modifier</Label>
          <Input value={mockup.itemNote ?? ''} onChange={(v) => updateMockup('itemNote', v)} placeholder="Less ice" />
        </div>
        <div>
          <Label>Table Label</Label>
          <Input value={mockup.tableLabel ?? ''} onChange={(v) => updateMockup('tableLabel', v)} placeholder="Meja" />
        </div>
        <div>
          <Label>Table Value (e.g. A-12)</Label>
          <Input value={mockup.tableValue ?? ''} onChange={(v) => updateMockup('tableValue', v)} placeholder="A-12" />
        </div>
      </div>
    </div>
  );
}

function LocalRootsEditor({ content, onChange }: { content: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const commitments = (content.commitments as { title: string; desc: string }[]) ?? [];
  const stats       = (content.stats as { value: string; label: string }[]) ?? [];

  function updateCommitment(i: number, key: string, value: string) {
    const updated = commitments.map((c, idx) => idx === i ? { ...c, [key]: value } : c);
    onChange({ ...content, commitments: updated });
  }

  function updateStat(i: number, key: string, value: string) {
    const updated = stats.map((s, idx) => idx === i ? { ...s, [key]: value } : s);
    onChange({ ...content, stats: updated });
  }

  function addStat() {
    onChange({ ...content, stats: [...stats, { value: '', label: '' }] });
  }

  function removeStat(i: number) {
    onChange({ ...content, stats: stats.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Tag Line</Label>
        <Input value={(content.tag as string) ?? ''} onChange={(v) => onChange({ ...content, tag: v })} placeholder="Our Story" />
      </div>
      <div>
        <Label>Section Title</Label>
        <Input value={(content.title as string) ?? ''} onChange={(v) => onChange({ ...content, title: v })} placeholder="Rooted in craft," />
      </div>
      <div>
        <Label>Section Title Accent</Label>
        <Input value={(content.titleAccent as string) ?? ''} onChange={(v) => onChange({ ...content, titleAccent: v })} placeholder="driven by passion." />
      </div>
      <div>
        <Label>Story Description</Label>
        <Input value={(content.description as string) ?? ''} onChange={(v) => onChange({ ...content, description: v })} multiline />
      </div>
      <ImageUploader
        label="Story Image"
        currentUrl={(content.storyImageUrl as string) ?? ''}
        onUrlChange={(url) => onChange({ ...content, storyImageUrl: url })}
      />
      <div>
        <Label>Story Image Alt Text</Label>
        <Input value={(content.storyImageAlt as string) ?? ''} onChange={(v) => onChange({ ...content, storyImageAlt: v })} placeholder="Freshly sourced coffee beans" />
      </div>

      {/* Stat overlays (optional — need at least 2) */}
      <div className="border-t border-coffee-100 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide">Stat Overlays</p>
          {stats.length < 2 && (
            <button
              type="button"
              onClick={addStat}
              className="flex items-center gap-1 text-xs font-semibold text-coffee-700 hover:text-coffee-900 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Tambah stat
            </button>
          )}
        </div>
        <p className="text-xs text-charcoal/50">Stats hanya ditampilkan jika ada tepat 2 entri dengan nilai dan label.</p>
        {stats.map((s, i) => (
          <div key={i} className="p-4 rounded-xl bg-coffee-50 border border-coffee-100 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-coffee-700">Stat {i + 1}</p>
              <button
                type="button"
                onClick={() => removeStat(i)}
                className="p-1 rounded-lg text-charcoal/30 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div>
              <Label>Value (e.g. 10.000+)</Label>
              <Input value={s.value} onChange={(v) => updateStat(i, 'value', v)} placeholder="10.000+" />
            </div>
            <div>
              <Label>Label</Label>
              <Input value={s.label} onChange={(v) => updateStat(i, 'label', v)} placeholder="Pelanggan" />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <p className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide">Commitments</p>
        {commitments.map((c, i) => (
          <div key={i} className="p-4 rounded-xl bg-coffee-50 border border-coffee-100 space-y-3">
            <p className="text-xs font-bold text-coffee-700">Commitment {i + 1}</p>
            <div>
              <Label>Title</Label>
              <Input value={c.title} onChange={(v) => updateCommitment(i, 'title', v)} />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={c.desc} onChange={(v) => updateCommitment(i, 'desc', v)} multiline />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FooterEditor({ content, onChange }: { content: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const socials  = (content.socials  as { platform: string; href: string; label: string }[]) ?? [];
  const rawColumns = content.linkColumns;
  const columns: { title: string; links: { label: string; href: string }[] }[] = Array.isArray(rawColumns)
    ? rawColumns.map((col) => ({
        title: typeof col?.title === 'string' ? col.title : '',
        links: Array.isArray(col?.links)
          ? col.links.map((link: any) => ({
              label: typeof link === 'string' ? link : String(link?.label ?? ''),
              href: typeof link === 'string' ? '' : String(link?.href ?? ''),
            }))
          : [],
      }))
    : (rawColumns && typeof rawColumns === 'object')
    ? Object.entries(rawColumns as Record<string, string[]>).map(([title, links]) => ({
        title,
        links: Array.isArray(links)
          ? links.map((label) => ({
              label: typeof label === 'string' ? label : String((label as any)?.label ?? ''),
              href: '',
            }))
          : [],
      }))
    : [];

  useEffect(() => {
    if (rawColumns && !Array.isArray(rawColumns)) {
      onChange({ ...content, linkColumns: columns });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawColumns]);

  const nl       = (content.newsletter as Record<string, unknown>) ?? {};

  function updateSocial(i: number, key: string, value: string) {
    const updated = socials.map((s, idx) => idx === i ? { ...s, [key]: value } : s);
    onChange({ ...content, socials: updated });
  }

  function updateColumn(ci: number, key: string, value: unknown) {
    const updated = columns.map((c, idx) => idx === ci ? { ...c, [key]: value } : c);
    onChange({ ...content, linkColumns: updated });
  }

  function updateLink(ci: number, li: number, key: string, value: string) {
    const updated = columns.map((c, cIdx) => {
      if (cIdx !== ci) return c;
      return { ...c, links: c.links.map((l: { label: string; href: string }, lIdx: number) => lIdx === li ? { ...l, [key]: value } : l) };
    });
    onChange({ ...content, linkColumns: updated });
  }

  function addLinkToColumn(ci: number) {
    const updated = columns.map((c, idx) => idx === ci ? { ...c, links: [...c.links, { label: '', href: '' }] } : c);
    onChange({ ...content, linkColumns: updated });
  }

  function removeLinkFromColumn(ci: number, li: number) {
    const updated = columns.map((c, idx) => idx === ci ? { ...c, links: c.links.filter((_: unknown, lIdx: number) => lIdx !== li) } : c);
    onChange({ ...content, linkColumns: updated });
  }

  function addColumn() {
    onChange({ ...content, linkColumns: [...columns, { title: '', links: [] }] });
  }

  function removeColumn(ci: number) {
    onChange({ ...content, linkColumns: columns.filter((_, idx) => idx !== ci) });
  }

  function updateNl(key: string, value: unknown) {
    onChange({ ...content, newsletter: { ...nl, [key]: value } });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Brand Name</Label>
        <Input value={(content.brandName as string) ?? ''} onChange={(v) => onChange({ ...content, brandName: v })} placeholder="CAFE" />
      </div>
      <div>
        <Label>Brand Subtitle</Label>
        <Input value={(content.brandSubtitle as string) ?? ''} onChange={(v) => onChange({ ...content, brandSubtitle: v })} placeholder="Specialty Coffee" />
      </div>
      <div>
        <Label>Footer Tagline</Label>
        <Input value={(content.tagline as string) ?? ''} onChange={(v) => onChange({ ...content, tagline: v })} placeholder="Great coffee and great food." multiline />
      </div>
      <div>
        <Label>Copyright Entity</Label>
        <Input value={(content.copyright as string) ?? ''} onChange={(v) => onChange({ ...content, copyright: v })} placeholder="Your Cafe" />
      </div>

      {/* Link columns */}
      <div className="border-t border-coffee-100 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide">Link Columns</p>
          <button type="button" onClick={addColumn} className="flex items-center gap-1 text-xs font-semibold text-coffee-700 hover:text-coffee-900 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Tambah kolom
          </button>
        </div>
        {columns.map((col, ci) => (
          <div key={ci} className="p-4 rounded-xl bg-coffee-50 border border-coffee-100 space-y-3">
            <div className="flex items-center justify-between">
              <Label>Column Title</Label>
              <button type="button" onClick={() => removeColumn(ci)} className="p-1 rounded-lg text-charcoal/30 hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <Input value={col.title} onChange={(v) => updateColumn(ci, 'title', v)} placeholder="Jelajahi" />
            {col.links.map((link: { label: string; href: string }, li: number) => (
              <div key={li} className="flex items-center gap-2">
                <Input value={link.label} onChange={(v) => updateLink(ci, li, 'label', v)} placeholder="Label" />
                <Input value={link.href}  onChange={(v) => updateLink(ci, li, 'href',  v)} placeholder="/path atau #anchor" />
                <button type="button" onClick={() => removeLinkFromColumn(ci, li)} className="p-1.5 rounded-lg text-charcoal/30 hover:text-red-500 hover:bg-red-50 flex-shrink-0 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => addLinkToColumn(ci)} className="flex items-center gap-1 text-xs font-semibold text-coffee-600 hover:text-coffee-800 transition-colors">
              <Plus className="w-3 h-3" /> Link
            </button>
          </div>
        ))}
      </div>

      {/* Socials */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide">Social Links</p>
        {socials.map((s, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs font-semibold text-coffee-600 w-20 flex-shrink-0 capitalize">{s.platform}</span>
            <Input value={s.href} onChange={(v) => updateSocial(i, 'href', v)} placeholder="https://..." />
          </div>
        ))}
      </div>

      {/* Newsletter */}
      <div className="border-t border-coffee-100 pt-4 space-y-3">
        <p className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide">Newsletter</p>
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={!!nl.enabled} onChange={(e) => updateNl('enabled', e.target.checked)} className="w-4 h-4 rounded accent-coffee-700" />
          <span className="text-sm font-semibold text-coffee-900">Aktifkan form newsletter di Footer</span>
        </label>
        {!!nl.enabled && (
          <div className="space-y-3 pl-6 border-l-2 border-coffee-100">
            <div>
              <Label>Label</Label>
              <Input value={(nl.label as string) ?? ''} onChange={(v) => updateNl('label', v)} placeholder="Dapatkan info terbaru &amp; penawaran" />
            </div>
            <div>
              <Label>Placeholder</Label>
              <Input value={(nl.placeholder as string) ?? ''} onChange={(v) => updateNl('placeholder', v)} placeholder="emailmu@contoh.com" />
            </div>
            <div>
              <Label>Success Message</Label>
              <Input value={(nl.successMessage as string) ?? ''} onChange={(v) => updateNl('successMessage', v)} placeholder="Terima kasih! Kamu sudah terdaftar." />
            </div>
            <a
              href="/api/admin/newsletter-export"
              download
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-coffee-200 text-coffee-700 text-sm font-semibold hover:bg-coffee-50 transition-colors w-fit"
            >
              <Download className="w-4 h-4" />
              Download Daftar Subscriber (CSV)
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function FeaturedMenuEditor({ content, onChange }: { content: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-coffee-50 border border-coffee-100 flex gap-2">
        <Info className="w-4 h-4 text-coffee-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-charcoal/60 leading-relaxed">
          Which items appear here is controlled by the <strong>&quot;Tampilkan di Beranda&quot;</strong> toggle on each menu item in <a href="/admin/menu" className="underline text-coffee-700">Menu Management</a>. Up to 8 items can be featured at a time.
        </p>
      </div>
      <div>
        <Label>Eyebrow / Tag</Label>
        <Input value={(content.eyebrow as string) ?? ''} onChange={(v) => onChange({ ...content, eyebrow: v })} placeholder="Pilihan Favorit" />
      </div>
      <div>
        <Label>Section Title</Label>
        <Input value={(content.title as string) ?? ''} onChange={(v) => onChange({ ...content, title: v })} placeholder="Menu Paling Disukai" />
      </div>
      <div>
        <Label>&quot;See All Menu&quot; Link Label</Label>
        <Input value={(content.linkLabel as string) ?? ''} onChange={(v) => onChange({ ...content, linkLabel: v })} placeholder="Lihat semua menu" />
      </div>
    </div>
  );
}

function SeoEditor({ content, onChange }: { content: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-coffee-50 border border-coffee-100 flex gap-2">
        <Info className="w-4 h-4 text-coffee-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-charcoal/60 leading-relaxed">
          These values are used in the <code>&lt;title&gt;</code> tag, meta description, and Open Graph / Twitter card previews. Leave blank to use the brand name as a fallback.
        </p>
      </div>
      <div>
        <Label>Page Title</Label>
        <Input value={(content.title as string) ?? ''} onChange={(v) => onChange({ ...content, title: v })} placeholder="Nama Kafe — Specialty Coffee" />
      </div>
      <div>
        <Label>Meta Description</Label>
        <Input value={(content.description as string) ?? ''} onChange={(v) => onChange({ ...content, description: v })} placeholder="Kopi artisan dan makanan segar. Pesan langsung dari mejamu." multiline />
      </div>
      <ImageUploader
        label="OG Image (1200×630 px recommended)"
        currentUrl={(content.ogImageUrl as string) ?? ''}
        onUrlChange={(url) => onChange({ ...content, ogImageUrl: url })}
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SiteContentPage() {
  const profile = useAdminProfile();
  const router = useRouter();

  useEffect(() => {
    if (profile.role !== 'superadmin') router.replace('/admin');
  }, [profile.role, router]);

  if (profile.role !== 'superadmin') {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="font-bold text-coffee-900">Access Denied</p>
          <p className="text-sm text-charcoal/50 mt-1">This page is only accessible to superadmins.</p>
        </div>
      </div>
    );
  }

  return <SiteContentEditor />;
}

// ─── Editor shell ─────────────────────────────────────────────────────────────

function SiteContentEditor() {
  const supabase = getSupabase();
  const [activeSection, setActiveSection] = useState<SectionKey>('theme');
  const [contents, setContents] = useState<Record<SectionKey, Record<string, unknown>>>({} as never);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'saving' | 'success' | 'error' | null>(null);

  // Fetch all sections on mount
  const fetchAll = useCallback(async () => {
    const { data } = await supabase.from('site_content').select('section, content');
    if (data) {
      const map: Record<string, Record<string, unknown>> = {};
      for (const row of data) {
        map[row.section] = row.content;
      }
      setContents(map as Record<SectionKey, Record<string, unknown>>);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaveState('saving');

    const payload = contents[activeSection] ?? {};
    const { error } = await supabase
      .from('site_content')
      .upsert({ section: activeSection, content: payload }, { onConflict: 'section' });

    if (error) {
      setSaveState('error');
    } else {
      setSaveState('success');
      if (activeSection === 'navbar' && payload.brandName) {
        try {
          localStorage.setItem('cafe-brand-name', String(payload.brandName));
          window.dispatchEvent(new Event('brandchange'));
        } catch {}
      }
      // Trigger ISR revalidation via API route
      try {
        const res = await fetch('/api/admin/revalidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag: 'site-content' }),
        });
        if (!res.ok) {
          toast('Tersimpan, tapi tampilan publik mungkin baru berubah dalam beberapa menit.');
        }
      } catch {
        toast('Tersimpan, tapi tampilan publik mungkin baru berubah dalam beberapa menit.');
      }
    }

    setTimeout(() => setSaveState(null), 3000);
  }

  function updateSection(key: SectionKey, value: Record<string, unknown>) {
    setContents((prev) => ({ ...prev, [key]: value }));
  }

  const activeDef = SECTIONS.find((s) => s.key === activeSection)!;
  const activeContent = contents[activeSection] ?? {};

  return (
    <div className="flex gap-6 min-h-[calc(100vh-140px)]">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 hidden lg:block">
        <div className="bg-white rounded-2xl border border-coffee-100/80 p-2 space-y-0.5 sticky top-24">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition-all ${
                activeSection === key
                  ? 'bg-coffee-700 text-cream'
                  : 'text-charcoal/60 hover:bg-coffee-50 hover:text-coffee-900'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </aside>

      {/* Mobile section select */}
      <div className="lg:hidden w-full">
        <select
          value={activeSection}
          onChange={(e) => setActiveSection(e.target.value as SectionKey)}
          className="w-full px-4 py-3 rounded-xl bg-white border border-coffee-100 text-charcoal text-sm font-semibold focus:outline-none focus:border-coffee-400 mb-4"
        >
          {SECTIONS.map(({ key, label }) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Editor area */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-extrabold text-coffee-900">{activeDef.label}</h1>
            <p className="text-sm text-charcoal/50 mt-0.5">{activeDef.description}</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saveState === 'saving' || loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-coffee-700 text-cream text-sm font-bold hover:bg-coffee-800 transition-colors active:scale-95 disabled:opacity-60"
          >
            {saveState === 'saving' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            ) : (
              <><Save className="w-4 h-4" /> Save Changes</>
            )}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 text-coffee-400 animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSave}>
            <div className="bg-white rounded-2xl border border-coffee-100/80 p-6">
              {activeSection === 'theme'             && <ThemeEditor             content={activeContent as Record<string, string>}          onChange={(v) => updateSection('theme',             v as Record<string, unknown>)} />}
              {activeSection === 'seo'               && <SeoEditor               content={activeContent}                                     onChange={(v) => updateSection('seo',               v)} />}
              {activeSection === 'navbar'            && <NavbarEditor            content={activeContent}                                     onChange={(v) => updateSection('navbar',            v)} />}
              {activeSection === 'hero'              && <HeroEditor              content={activeContent}                                     onChange={(v) => updateSection('hero',              v)} />}
              {activeSection === 'value_proposition' && <ValuePropositionEditor  content={activeContent}                                     onChange={(v) => updateSection('value_proposition', v)} />}
              {activeSection === 'how_it_works'      && <HowItWorksEditor        content={activeContent}                                     onChange={(v) => updateSection('how_it_works',      v)} />}
              {activeSection === 'featured_menu'     && <FeaturedMenuEditor      content={activeContent}                                     onChange={(v) => updateSection('featured_menu',     v)} />}
              {activeSection === 'local_roots'       && <LocalRootsEditor        content={activeContent}                                     onChange={(v) => updateSection('local_roots',       v)} />}
              {activeSection === 'footer'            && <FooterEditor            content={activeContent}                                     onChange={(v) => updateSection('footer',            v)} />}
            </div>
          </form>
        )}
      </div>

      <SaveToast state={saveState} />
    </div>
  );
}
