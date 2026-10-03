'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  RotateCcw,
  ArrowLeft,
  ExternalLink,
  Copy,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  Pencil,
} from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import { useAdminProfile } from '../../AdminShell';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { DEFAULT_SITE_PAGES, ORDERED_SITE_PAGE_SLUGS, type SitePageDefault, AVAILABLE_PLACEHOLDERS } from '@/lib/page-defaults';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';

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

type SitePage = {
  id: string;
  slug: string;
  title: string;
  content: string;
  is_published: boolean;
  updated_at: string;
};

type EditorView = 'list' | 'edit';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '—';
  }
}

function slugLabel(slug: string): string {
  return {
    'support': 'Support',
    'help-centre': 'Help Centre',
    'contact-us': 'Contact Us',
    'privacy-policy': 'Privacy Policy',
    'terms-of-service': 'Terms of Service',
  }[slug] ?? slug;
}

// ─── Placeholder chips ────────────────────────────────────────────────────────

function PlaceholderChips({ onInsert }: { onInsert: (placeholder: string) => void }) {
  const [copied, setCopied] = useState<string | null>(null);

  function handleCopy(placeholder: string) {
    navigator.clipboard.writeText(placeholder).catch(() => {});
    setCopied(placeholder);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-charcoal/50 uppercase tracking-wider">Available Placeholders</p>
      <div className="flex flex-wrap gap-2">
        {AVAILABLE_PLACEHOLDERS.map((p) => (
          <button
            key={p.key}
            type="button"
            title={`${p.description}\nExample: ${p.example}`}
            onClick={() => onInsert(p.placeholder)}
            onDoubleClick={() => handleCopy(p.placeholder)}
            className="group relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-coffee-50 border border-coffee-200 text-xs font-mono font-semibold text-coffee-700 hover:bg-coffee-100 hover:border-coffee-400 transition-all active:scale-95 cursor-pointer"
          >
            {copied === p.placeholder ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span className="text-emerald-700">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                {p.placeholder}
              </>
            )}
          </button>
        ))}
      </div>
      <p className="text-xs text-charcoal/40">
        Click to insert at cursor · Double-click to copy · Hover for description
      </p>
    </div>
  );
}

// ─── Live preview panel ───────────────────────────────────────────────────────

function LivePreview({ content }: { content: string }) {
  // Replace placeholders with sample values for preview
  const sampleValues: Record<string, string> = {
    '{{cafe_name}}': 'Cafe Example',
    '{{contact_email}}': 'hello@cafe.com',
    '{{contact_phone}}': '+62 812-3456-7890',
    '{{address}}': 'Jl. Kopi No. 1, Jakarta Selatan',
    '{{opening_hours}}': 'Senin–Minggu: 08.00–22.00',
    '{{whatsapp}}': 'https://wa.me/6281234567890',
    '{{instagram}}': 'https://instagram.com/cafe_example',
  };

  let preview = content;
  for (const [key, val] of Object.entries(sampleValues)) {
    preview = preview.split(key).join(val);
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mb-3 flex items-center gap-2">
        <Eye className="w-4 h-4 text-coffee-500" />
        <span className="text-xs font-bold text-charcoal/50 uppercase tracking-wider">Live Preview</span>
        <span className="text-xs text-charcoal/40">(sample values)</span>
      </div>
      <div className="bg-white rounded-xl border border-coffee-100 p-5 min-h-[200px]">
        {preview.trim() ? (
          <MarkdownRenderer content={preview} />
        ) : (
          <p className="text-sm text-charcoal/30 italic">Preview will appear here…</p>
        )}
      </div>
    </div>
  );
}

// ─── Pages List ───────────────────────────────────────────────────────────────

function PagesList({
  pages,
  onEdit,
  onTogglePublished,
  togglingId,
}: {
  pages: SitePage[];
  onEdit: (page: SitePage) => void;
  onTogglePublished: (page: SitePage) => void;
  togglingId: string | null;
}) {
  return (
    <div className="space-y-3">
      {ORDERED_SITE_PAGE_SLUGS.map((slug) => {
        const page = pages.find((p) => p.slug === slug);
        const isToggling = page && togglingId === page.id;

        return (
          <motion.div
            key={slug}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-coffee-100/80 p-5 flex items-center justify-between gap-4 hover:border-coffee-200 transition-colors group"
          >
            {/* Left: icon + info */}
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-coffee-50 border border-coffee-100 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-coffee-600" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-coffee-900 text-sm truncate">
                    {page ? page.title : slugLabel(slug)}
                  </span>
                  {page ? (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                        page.is_published
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {page.is_published ? (
                        <><Eye className="w-3 h-3" /> Published</>
                      ) : (
                        <><EyeOff className="w-3 h-3" /> Draft</>
                      )}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-200">
                      <AlertCircle className="w-3 h-3" /> Not in DB
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-charcoal/40 font-mono">/p/{slug}</span>
                  {page && (
                    <>
                      <span className="text-charcoal/20">·</span>
                      <span className="text-xs text-charcoal/40">
                        Updated {formatDate(page.updated_at)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* External link */}
              {page && (
                <a
                  href={`/p/${slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View public page"
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-charcoal/40 hover:bg-coffee-50 hover:text-coffee-700 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}

              {/* Published toggle */}
              {page && (
                <button
                  type="button"
                  onClick={() => onTogglePublished(page)}
                  disabled={!!isToggling}
                  title={page.is_published ? 'Set to Draft' : 'Publish'}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-charcoal/40 hover:bg-coffee-50 hover:text-coffee-700 transition-colors disabled:opacity-50"
                >
                  {isToggling ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : page.is_published ? (
                    <ToggleRight className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <ToggleLeft className="w-5 h-5 text-charcoal/40" />
                  )}
                </button>
              )}

              {/* Edit button */}
              <button
                type="button"
                onClick={() => page && onEdit(page)}
                disabled={!page}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold bg-coffee-700 text-cream hover:bg-coffee-800 transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Edit view ────────────────────────────────────────────────────────────────

function PageEditor({
  page,
  onBack,
  onSaved,
}: {
  page: SitePage;
  onBack: () => void;
  onSaved: (updated: SitePage) => void;
}) {
  const supabase = getSupabase();
  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content);
  const [isPublished, setIsPublished] = useState(page.is_published);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [saveState, setSaveState] = useState<'success' | 'error' | null>(null);
  const textareaRef = useState<HTMLTextAreaElement | null>(null);

  const defaultPage: SitePageDefault | undefined = DEFAULT_SITE_PAGES[page.slug as keyof typeof DEFAULT_SITE_PAGES];

  const isDirty =
    title !== page.title || content !== page.content || isPublished !== page.is_published;

  function insertPlaceholder(placeholder: string) {
    const ta = document.getElementById('page-content-editor') as HTMLTextAreaElement | null;
    if (!ta) {
      setContent((prev) => prev + placeholder);
      return;
    }
    const start = ta.selectionStart ?? content.length;
    const end = ta.selectionEnd ?? content.length;
    const newContent = content.slice(0, start) + placeholder + content.slice(end);
    setContent(newContent);
    // Restore cursor after inserted text
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + placeholder.length, start + placeholder.length);
    });
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setSaveState(null);

    const { data, error } = await supabase
      .from('site_pages')
      .update({ title, content, is_published: isPublished, updated_at: new Date().toISOString() })
      .eq('id', page.id)
      .select('id, slug, title, content, is_published, updated_at')
      .single();

    if (error || !data) {
      setSaveState('error');
      toast.error('Failed to save page. Please try again.');
    } else {
      setSaveState('success');
      toast.success('Page saved!');
      onSaved(data as SitePage);

      // ISR revalidation
      try {
        await fetch('/api/admin/revalidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tags: ['site-pages', `site-page-${page.slug}`],
            paths: [`/p/${page.slug}`],
          }),
        });
      } catch {
        // Non-critical — page will self-revalidate after TTL
      }
    }

    setSaving(false);
    setTimeout(() => setSaveState(null), 3000);
  }

  async function handleReset() {
    if (!defaultPage || resetting) return;
    setResetting(true);
    setTitle(defaultPage.title);
    setContent(defaultPage.content);
    setShowResetConfirm(false);
    setResetting(false);
    toast('Content reset to default. Click Save to persist.');
  }

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-charcoal/60 hover:bg-coffee-50 hover:text-coffee-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            All Pages
          </button>
          <ChevronRight className="w-4 h-4 text-charcoal/30" />
          <span className="text-sm font-bold text-coffee-900">{slugLabel(page.slug)}</span>
          <a
            href={`/p/${page.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            title="View public page"
            className="text-charcoal/40 hover:text-coffee-700 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="flex items-center gap-2">
          {/* Published toggle */}
          <button
            type="button"
            onClick={() => setIsPublished(!isPublished)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border transition-all ${
              isPublished
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
            }`}
          >
            {isPublished ? (
              <><Eye className="w-4 h-4" /> Published</>
            ) : (
              <><EyeOff className="w-4 h-4" /> Draft</>
            )}
          </button>

          {/* Reset button */}
          {defaultPage && (
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold text-charcoal/60 hover:bg-coffee-50 hover:text-coffee-900 border border-coffee-100 hover:border-coffee-200 transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          )}

          {/* Save button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold bg-coffee-700 text-cream hover:bg-coffee-800 transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            ) : saveState === 'success' ? (
              <><CheckCircle2 className="w-4 h-4 text-emerald-300" /> Saved!</>
            ) : saveState === 'error' ? (
              <><AlertCircle className="w-4 h-4 text-red-300" /> Failed</>
            ) : (
              <><Save className="w-4 h-4" /> Save Changes</>
            )}
          </button>
        </div>
      </div>

      {/* Reset confirm dialog */}
      <AnimatePresence>
        {showResetConfirm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap"
          >
            <div className="flex items-center gap-3">
              <RotateCcw className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-800">
                <strong>Reset to default?</strong> This will replace the title and content with the original template. You'll still need to click Save.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-charcoal/60 hover:bg-amber-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={resetting}
                className="px-4 py-1.5 rounded-lg text-sm font-bold bg-amber-600 text-white hover:bg-amber-700 transition-colors active:scale-95"
              >
                Reset Content
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Form */}
      <div className="bg-white rounded-2xl border border-coffee-100/80 p-5 sm:p-7 space-y-5">
        {/* Title field */}
        <div>
          <label className="block text-xs font-bold text-charcoal/50 uppercase tracking-wider mb-1.5">
            Page Title
          </label>
          <input
            type="text"
            id="page-title-editor"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Page title…"
            className="w-full px-4 py-3 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm font-semibold focus:outline-none focus:border-coffee-400 transition-colors"
          />
        </div>

        {/* Editor / Preview tabs */}
        <div>
          <div className="flex items-center gap-1 mb-3 border-b border-coffee-100 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('edit')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'edit'
                  ? 'bg-coffee-700 text-cream'
                  : 'text-charcoal/50 hover:bg-coffee-50 hover:text-coffee-900'
              }`}
            >
              Edit Markdown
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'preview'
                  ? 'bg-coffee-700 text-cream'
                  : 'text-charcoal/50 hover:bg-coffee-50 hover:text-coffee-900'
              }`}
            >
              Preview
            </button>
          </div>

          {activeTab === 'edit' ? (
            <div className="space-y-3">
              <label className="block text-xs font-bold text-charcoal/50 uppercase tracking-wider">
                Markdown Content
              </label>
              <textarea
                id="page-content-editor"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={20}
                spellCheck
                className="w-full px-4 py-3 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm font-mono leading-relaxed focus:outline-none focus:border-coffee-400 transition-colors resize-y"
                placeholder="Write your markdown content here…"
              />
            </div>
          ) : (
            <LivePreview content={content} />
          )}
        </div>

        {/* Placeholder chips */}
        <div className="pt-2 border-t border-coffee-50">
          <PlaceholderChips onInsert={insertPlaceholder} />
        </div>
      </div>
    </div>
  );
}

// ─── Main Pages Admin Page ────────────────────────────────────────────────────

export default function AdminPagesPage() {
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

  return <PagesEditor />;
}

// ─── Editor shell ─────────────────────────────────────────────────────────────

function PagesEditor() {
  const supabase = getSupabase();
  const [pages, setPages] = useState<SitePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<EditorView>('list');
  const [editingPage, setEditingPage] = useState<SitePage | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchPages = useCallback(async () => {
    const { data, error } = await supabase
      .from('site_pages')
      .select('id, slug, title, content, is_published, updated_at')
      .order('updated_at', { ascending: false });

    if (!error && data) {
      setPages(data as SitePage[]);
    } else if (error) {
      toast.error('Failed to load pages.');
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  async function handleTogglePublished(page: SitePage) {
    setTogglingId(page.id);
    const newPublished = !page.is_published;

    const { error } = await supabase
      .from('site_pages')
      .update({ is_published: newPublished, updated_at: new Date().toISOString() })
      .eq('id', page.id);

    if (error) {
      toast.error('Failed to update page status.');
    } else {
      setPages((prev) =>
        prev.map((p) =>
          p.id === page.id ? { ...p, is_published: newPublished } : p,
        ),
      );
      toast.success(newPublished ? 'Page published.' : 'Page set to draft.');

      // Revalidate ISR
      try {
        await fetch('/api/admin/revalidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tags: ['site-pages', `site-page-${page.slug}`],
            paths: [`/p/${page.slug}`],
          }),
        });
      } catch {
        // Non-critical
      }
    }

    setTogglingId(null);
  }

  function handleEdit(page: SitePage) {
    setEditingPage(page);
    setView('edit');
  }

  function handleBack() {
    setEditingPage(null);
    setView('list');
  }

  function handleSaved(updated: SitePage) {
    setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setEditingPage(updated);
  }

  return (
    <div>
      {/* Page header (only on list view) */}
      {view === 'list' && (
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-coffee-950 tracking-tight">Pages</h1>
          <p className="text-sm text-charcoal/50 mt-1">
            Manage the 5 editable footer pages. Content supports Markdown and dynamic placeholders.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 text-coffee-400 animate-spin" />
        </div>
      ) : view === 'edit' && editingPage ? (
        <PageEditor page={editingPage} onBack={handleBack} onSaved={handleSaved} />
      ) : (
        <PagesList
          pages={pages}
          onEdit={handleEdit}
          onTogglePublished={handleTogglePublished}
          togglingId={togglingId}
        />
      )}
    </div>
  );
}
