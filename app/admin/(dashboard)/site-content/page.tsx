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
} from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import { useAdminProfile } from '../../AdminShell';
import { useRouter } from 'next/navigation';

// ─── Supabase client ──────────────────────────────────────────────────────────

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      '',
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SectionKey = 'navbar' | 'hero' | 'value_proposition' | 'how_it_works' | 'local_roots' | 'footer' | 'theme';

type SectionDef = {
  key: SectionKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
};

const SECTIONS: SectionDef[] = [
  { key: 'theme',            label: 'Branding & Theme',  icon: Palette,    description: 'Color palette, brand name, and logo' },
  { key: 'navbar',           label: 'Navigation',        icon: Navigation, description: 'Brand name, subtitle, and nav links' },
  { key: 'hero',             label: 'Hero Section',      icon: Layout,     description: 'Main headline, subheadline, CTA, and hero image' },
  { key: 'value_proposition',label: 'Value Proposition', icon: Star,       description: 'Why choose us — feature cards' },
  { key: 'how_it_works',     label: 'How It Works',      icon: BookOpen,   description: 'Steps, title, and description' },
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
        <Input value={(content.headlineAccent as string) ?? ''} onChange={(v) => onChange({ ...content, headlineAccent: v })} placeholder="& Fresh Kitchen." />
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
  const steps = (content.steps as { num: string; title: string; desc: string }[]) ?? [];

  function updateStep(i: number, key: string, value: string) {
    const updated = steps.map((s, idx) => idx === i ? { ...s, [key]: value } : s);
    onChange({ ...content, steps: updated });
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
    </div>
  );
}

function LocalRootsEditor({ content, onChange }: { content: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const commitments = (content.commitments as { title: string; desc: string }[]) ?? [];

  function updateCommitment(i: number, key: string, value: string) {
    const updated = commitments.map((c, idx) => idx === i ? { ...c, [key]: value } : c);
    onChange({ ...content, commitments: updated });
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
  const socials = (content.socials as { platform: string; href: string; label: string }[]) ?? [];

  function updateSocial(i: number, key: string, value: string) {
    const updated = socials.map((s, idx) => idx === i ? { ...s, [key]: value } : s);
    onChange({ ...content, socials: updated });
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
      <div className="space-y-3">
        <p className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide">Social Links</p>
        {socials.map((s, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs font-semibold text-coffee-600 w-20 flex-shrink-0 capitalize">{s.platform}</span>
            <Input value={s.href} onChange={(v) => updateSocial(i, 'href', v)} placeholder="https://..." />
          </div>
        ))}
      </div>
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
      await fetch('/api/admin/revalidate', { method: 'POST' }).catch(() => null);
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
              {activeSection === 'navbar'            && <NavbarEditor            content={activeContent}                                     onChange={(v) => updateSection('navbar',            v)} />}
              {activeSection === 'hero'              && <HeroEditor              content={activeContent}                                     onChange={(v) => updateSection('hero',              v)} />}
              {activeSection === 'value_proposition' && <ValuePropositionEditor  content={activeContent}                                     onChange={(v) => updateSection('value_proposition', v)} />}
              {activeSection === 'how_it_works'      && <HowItWorksEditor        content={activeContent}                                     onChange={(v) => updateSection('how_it_works',      v)} />}
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
