'use client';

import { useEffect, useState, useCallback, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { QrCode, Plus, Minus, ShoppingCart, X, ArrowLeft, Search, Lock, AlertCircle, Camera, Receipt, RefreshCw, CheckCircle2, MessageSquare, Pencil, Trash2, Clock, Users, Copy, Share2, Loader2, UserCheck, UserMinus, Crown, LogOut } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { fadeInUp, staggerContainer } from '@/lib/animations';
import { toast } from 'sonner';
import QrScannerModal from '@/components/ui/QrScannerModal';
import WifiInfoCard from '@/components/ui/WifiInfoCard';
import ItemNoteModal from '@/components/ui/ItemNoteModal';
import ProductDetailModal from '@/components/ui/ProductDetailModal';
import TableRequestModal from '@/components/ui/TableRequestModal';
import { getItemLineKey, normalizeNote, calculateOptionsTotal, formatItemOptionsSummary, type SelectedOption, type ItemOptionGroup } from '@/lib/item-options';
import { CART_KEY } from '@/lib/cart';
import { useBrand } from '@/components/providers/BrandProvider';
import { fetchBranchMenu, type BranchMenuItem } from '@/lib/menu-availability';
import { useBranchInfo } from '@/lib/branch-info';
import { roundToFiveMinutes } from '@/lib/wait-time';
import {
  useGroupCart,
  getLocalGroupSession,
  saveLocalGroupSession,
  clearLocalGroupSession,
  getLastDisplayName,
  setGroupCartItem,
  removeGroupCartItem,
  type LocalGroupSession,
  type GroupCartState,
} from '@/lib/group-cart';
import { TABLE_KEY as STORAGE_TABLE_KEY, BRANCH_KEY as STORAGE_BRANCH_KEY } from '@/lib/storage-keys';

type MenuItem = BranchMenuItem;

type CartItem = MenuItem & {
  lineKey: string;
  quantity: number;
  note?: string | null;
  selectedOptions?: SelectedOption[] | null;
};

const categories = [
  { id: 'all', label: 'Semua' },
  { id: 'kopi', label: 'Kopi' },
  { id: 'non-kopi', label: 'Non-Kopi' },
  { id: 'makanan', label: 'Makanan' },
  { id: 'snack', label: 'Snack' },
];

function formatPrice(price: number): string {
  return 'Rp ' + price.toLocaleString('id-ID') + ',-';
}

const TABLE_KEY = STORAGE_TABLE_KEY;
const BRANCH_KEY = STORAGE_BRANCH_KEY;

export default function MenuPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream" />}>
      <MenuPageInner />
    </Suspense>
  );
}

function MenuPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { brandName } = useBrand();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuLoaded, setMenuLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [tableNumber, setTableNumber] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [showQrGuide, setShowQrGuide] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [tableChangeNotice, setTableChangeNotice] = useState<string | null>(null);
  const [canHover, setCanHover] = useState(false);

  // Branch info (wifi, wait time, accepting_orders)
  const { info: branchInfo, refresh: refreshBranchInfo } = useBranchInfo(branchId);
  const isPaused = branchInfo?.accepting_orders === false;
  const pauseMsg = branchInfo?.pause_message || 'Maaf, pemesanan sedang dijeda sementara. Silakan hubungi barista ya.';

  // Note modal state (kept for editing cart items from the cart drawer)
  const [noteModalTarget, setNoteModalTarget] = useState<{
    item: MenuItem;
    initialNote?: string;
    initialQuantity?: number;
    lineKeyToEdit?: string;
    isEditing: boolean;
  } | null>(null);

  // Product detail popup state
  const [detailTarget, setDetailTarget] = useState<MenuItem | null>(null);

  // ── Group cart (Pesan Bareng) state ──────────────────────────────────────────
  // Local session loaded from localStorage on mount
  const [groupSession, setGroupSession] = useState<LocalGroupSession | null>(null);
  // Whether the invite / share sheet is open
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  // Whether the member list sheet is open
  const [memberSheetOpen, setMemberSheetOpen] = useState(false);
  // Name input for creating a new group cart
  const [createGroupName, setCreateGroupName] = useState('');
  // Whether the "start group" sheet is open
  const [startGroupSheetOpen, setStartGroupSheetOpen] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [createGroupError, setCreateGroupError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);

  // Poll the live cart state (only when in group mode)
  const { cart: groupCart, loading: groupLoading, error: groupError, refresh: refreshGroupCart } = useGroupCart(
    groupSession?.code ?? null,
    groupSession,
    { enabled: !!groupSession },
  );

  // Error shown as a toast when a group cart mutation fails (e.g. 410 Gone)
  const [groupCartMutationError, setGroupCartMutationError] = useState<string | null>(null);

  // Active group session code (from URL or localStorage)
  const [groupCodeFromUrl, setGroupCodeFromUrl] = useState<string | null>(null);

  // Are we in group mode?
  const isGroupMode = !!groupSession;
  // Is the current user the host?
  const iAmHost = isGroupMode && !!groupCart?.members.find(
    (m) => m.id === groupSession?.member_id && m.is_host,
  );
  // My member record from live cart
  const myMember = groupCart?.members.find((m) => m.id === groupSession?.member_id);
  // Waiting for order_code after host claims submission
  const isAwaitingOrderCode = groupCart?.status === 'submitted' && !groupCart?.order_code;
  const submittedSinceRef = useRef<number | null>(null);

  // Restore cart from localStorage on mount (with lineKey backward compatibility)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setCart(
            parsed.map((item: any) => ({
              ...item,
              lineKey: item.lineKey || getItemLineKey(item.id, item.note),
              note: item.note || undefined,
            })),
          );
        }
      }
    } catch {
      // ignore parse error
    }
  }, []);

  // Auto-dismiss table notice after 6 seconds
  useEffect(() => {
    if (!tableChangeNotice) return;
    const timer = setTimeout(() => {
      setTableChangeNotice(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [tableChangeNotice]);

  // Enable hover lift only on sm+ screens with pointer/hover support
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const media = window.matchMedia('(hover: hover) and (min-width: 640px)');
      setCanHover(media.matches);
      const listener = (e: MediaQueryListEvent) => setCanHover(e.matches);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, []);

  const handleScanSuccess = useCallback(
    (scanned: string, scannedBranchId: string | null) => {
      const prevTable = localStorage.getItem(TABLE_KEY);
      setTableNumber(scanned);
      localStorage.setItem(TABLE_KEY, scanned);
      if (scannedBranchId) {
        setBranchId(scannedBranchId);
        localStorage.setItem(BRANCH_KEY, scannedBranchId);
      }
      if (prevTable && prevTable !== scanned) {
        setTableChangeNotice(
          `Meja berhasil dipindahkan dari Meja ${prevTable} ke Meja ${scanned}! Keranjang belanja kamu tetap tersimpan.`,
        );
      } else {
        setTableChangeNotice(`Terhubung ke Meja ${scanned}! Selamat memesan.`);
      }
      const url = scannedBranchId
        ? `/menu?table=${scanned}&branch=${scannedBranchId}`
        : `/menu?table=${scanned}`;
      router.replace(url);
    },
    [router],
  );

  // Table-aware QR: `/menu?table=A-12&branch=<uuid>` from a scanned table QR code wins and
  // is remembered; otherwise fall back to whatever table/branch was set last time.
  // Users cannot manually edit the table code; it must come from QR scanning.
  useEffect(() => {
    const fromQr = searchParams.get('table');
    const fromBranch = searchParams.get('branch');
    if (fromQr && fromQr.trim()) {
      const clean = fromQr.trim().toUpperCase();
      const stored = localStorage.getItem(TABLE_KEY);
      if (stored && stored !== clean) {
        setTableChangeNotice(
          `Meja berhasil dipindahkan dari Meja ${stored} ke Meja ${clean}! Keranjang belanja kamu tetap tersimpan.`,
        );
      }
      setTableNumber(clean);
      localStorage.setItem(TABLE_KEY, clean);
    } else {
      const stored = localStorage.getItem(TABLE_KEY);
      if (stored) setTableNumber(stored);
    }
    if (fromBranch && fromBranch.trim()) {
      setBranchId(fromBranch.trim());
      localStorage.setItem(BRANCH_KEY, fromBranch.trim());
    } else {
      const storedBranch = localStorage.getItem(BRANCH_KEY);
      if (storedBranch) setBranchId(storedBranch);
    }
  }, [searchParams]);

  const fetchMenu = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const data = await fetchBranchMenu(branchId);
        setItems(data);
        setMenuLoaded(true);
        setError(null);
      } catch {
        setError('Gagal memuat menu. Coba lagi nanti.');
        setMenuLoaded(false);
      } finally {
        setLoading(false);
      }
    },
    [branchId],
  );

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  // Refetch menu when tab becomes visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchMenu(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchMenu]);

  // Refresh branch info (accepting_orders) every 60s and on tab visibility
  useEffect(() => {
    const interval = setInterval(() => {
      refreshBranchInfo();
    }, 60_000);

    const handleVisible = () => {
      if (document.visibilityState === 'visible') refreshBranchInfo();
    };
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [refreshBranchInfo]);

  // ── Group cart: restore session from localStorage + ?group= URL param ─────────
  useEffect(() => {
    const fromUrl = searchParams.get('group');
    if (fromUrl) {
      setGroupCodeFromUrl(fromUrl);
      const existing = getLocalGroupSession();
      if (existing && existing.code === fromUrl) {
        setGroupSession(existing);
      } else {
        // Redirect to join page — they haven't joined yet
        router.replace(`/group/${encodeURIComponent(fromUrl)}`);
      }
    } else {
      // No group param — check localStorage for an active session
      const existing = getLocalGroupSession();
      if (existing) {
        setGroupSession(existing);
      }
    }
    // Pre-fill create-group name from last used display name
    setCreateGroupName(getLastDisplayName());
  }, [searchParams, router]);

  // Auto-redirect when submitted → status page for the new order
  useEffect(() => {
    if (!groupCart) return;

    if (groupCart.status === 'submitted') {
      if (groupCart.order_code) {
        submittedSinceRef.current = null;
        // Happy path: order was created — go to status page
        router.push(`/status/${groupCart.order_code}`);
        return;
      }

      // Polled group cart has status 'submitted' but NO order_code yet:
      // Do NOT clear the group session. Keep polling (~1.5s).
      if (submittedSinceRef.current === null) {
        submittedSinceRef.current = Date.now();
      }

      const elapsed = Date.now() - submittedSinceRef.current;
      const remainingMs = Math.max(0, 30_000 - elapsed);

      const timeoutId = setTimeout(() => {
        // Only treat it as stuck after 30 seconds with still no order_code
        submittedSinceRef.current = null;
        clearLocalGroupSession();
        setGroupSession(null);
        setGroupCartMutationError(
          'Sesi Pesan Bareng sebelumnya telah berakhir. Silakan mulai sesi baru.',
        );
        router.replace('/menu');
      }, remainingMs);

      return () => clearTimeout(timeoutId);
    } else {
      submittedSinceRef.current = null;
    }

    if (groupCart.status === 'cancelled') {
      clearLocalGroupSession();
      setGroupSession(null);
      router.replace('/menu');
    }
  }, [groupCart?.status, groupCart?.order_code, router]);

  // ── Group actions ─────────────────────────────────────────────────────────────

  const handleCreateGroup = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = createGroupName.trim();
    if (!trimmed || !tableNumber) return;
    setCreatingGroup(true);
    setCreateGroupError(null);
    try {
      const res = await fetch('/api/group-carts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_number: tableNumber,
          branch_id: branchId ?? undefined,
          name: trimmed,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateGroupError(data?.error ?? 'Gagal membuat sesi grup.');
        setCreatingGroup(false);
        return;
      }
      const session: LocalGroupSession = {
        code: data.code,
        member_id: data.member_id,
        member_token: data.member_token,
        name: trimmed,
      };
      saveLocalGroupSession(session);
      setGroupSession(session);
      setStartGroupSheetOpen(false);
      setInviteSheetOpen(true);
      router.replace(`/menu?group=${encodeURIComponent(data.code)}`);
    } catch {
      setCreateGroupError('Koneksi bermasalah. Coba lagi ya.');
    } finally {
      setCreatingGroup(false);
    }
  }, [createGroupName, tableNumber, branchId, router]);

  const handleLeaveGroup = useCallback(async () => {
    if (!groupSession || iAmHost) return;
    setLeavingGroup(true);
    try {
      await fetch(`/api/group-carts/${encodeURIComponent(groupSession.code)}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-member-token': groupSession.member_token,
        },
      });
    } finally {
      clearLocalGroupSession();
      setGroupSession(null);
      router.replace('/menu');
      setLeavingGroup(false);
    }
  }, [groupSession, iAmHost, router]);

  const handleCancelGroup = useCallback(async () => {
    if (!groupSession || !iAmHost) return;
    try {
      await fetch(`/api/group-carts/${encodeURIComponent(groupSession.code)}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-member-token': groupSession.member_token,
        },
      });
    } finally {
      clearLocalGroupSession();
      setGroupSession(null);
      router.replace('/menu');
    }
  }, [groupSession, iAmHost, router]);

  const handleToggleReady = useCallback(async (isReady: boolean) => {
    if (!groupSession) return;
    await fetch(`/api/group-carts/${encodeURIComponent(groupSession.code)}/ready`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-member-token': groupSession.member_token,
      },
      body: JSON.stringify({ is_ready: isReady }),
    });
    refreshGroupCart();
  }, [groupSession, refreshGroupCart]);

  const handleKickMember = useCallback(async (memberId: string) => {
    if (!groupSession || !iAmHost) return;
    await fetch(`/api/group-carts/${encodeURIComponent(groupSession.code)}/kick`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-member-token': groupSession.member_token,
      },
      body: JSON.stringify({ member_id: memberId }),
    });
    refreshGroupCart();
  }, [groupSession, iAmHost, refreshGroupCart]);

  const handleCopyInvite = useCallback(() => {
    if (!groupSession) return;
    const link = `${window.location.origin}/group/${groupSession.code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [groupSession]);

  const handleShareInvite = useCallback(() => {
    if (!groupSession) return;
    const link = `${window.location.origin}/group/${groupSession.code}`;
    if (navigator.share) {
      navigator.share({ title: 'Pesan Bareng Yuk!', url: link }).catch(() => {});
    } else {
      handleCopyInvite();
    }
  }, [groupSession, handleCopyInvite]);

  // Compute invite URL
  const inviteUrl = groupSession
    ? (typeof window !== 'undefined' ? `${window.location.origin}/group/${groupSession.code}` : '')
    : '';

  const filteredItems = items.filter((item) => {

    const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
    const matchesSearch =
      searchQuery === '' ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    return matchesCategory && matchesSearch;
  });

  // Sold-out items stay searchable and stay in their category, but are listed after available ones (stable sort)
  const sortedItems = [...filteredItems].sort((a, b) => {
    if (a.sold_out === b.sold_out) return 0;
    return a.sold_out ? 1 : -1;
  });

  // Mark cart lines whose menu id is sold out OR missing from loaded list as unavailable
  const isLineUnavailable = useCallback(
    (itemId: string) => {
      if (!menuLoaded || loading || Boolean(error)) return false;
      const menuItem = items.find((i) => i.id === itemId);
      return !menuItem || menuItem.sold_out;
    },
    [menuLoaded, loading, error, items],
  );

  const hasUnavailableItems =
    menuLoaded && !loading && !error && cart.some((c) => isLineUnavailable(c.id));

  const removeUnavailableItems = useCallback(() => {
    setCart((prev) => {
      const next = prev.filter((c) => !isLineUnavailable(c.id));
      try {
        localStorage.setItem(CART_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [isLineUnavailable]);

  // Migrate any items in local cart into group cart upon joining/starting group
  const syncedCartRef = useRef<string | null>(null);
  useEffect(() => {
    if (!groupSession?.code || !groupSession?.member_token || cart.length === 0) return;
    if (syncedCartRef.current === groupSession.code) return;
    syncedCartRef.current = groupSession.code;

    Promise.all(
      cart.map((c) =>
        setGroupCartItem(groupSession.code, groupSession.member_token, c.id, c.quantity, c.note)
      )
    ).then(() => {
      setCart([]);
      try { localStorage.removeItem(CART_KEY); } catch {}
      refreshGroupCart();
    });
  }, [groupSession, cart, refreshGroupCart]);

  const addToCartWithNote = useCallback(
    (
      item: MenuItem,
      note?: string | null,
      qty = 1,
      selectedOptions?: SelectedOption[] | null,
    ) => {
      // Defense in depth: refuse sold-out items
      if (item.sold_out) return;

      const cleanNote = normalizeNote(note);

      if (isGroupMode && groupSession) {
        const optionGroups = Array.isArray(item.options) ? (item.options as ItemOptionGroup[]) : [];
        if (optionGroups.length > 0) {
          toast.error('Pesan Bareng belum mendukung menu dengan opsi tambahan. Silakan pesan menu ini secara terpisah.', { duration: 3500 });
          return;
        }
        const existing = groupCart?.items.find(
          (i) =>
            i.member_id === groupSession.member_id &&
            i.menu_item_id === item.id &&
            (i.note || '') === (cleanNote || '')
        );
        const newQty = (existing?.quantity ?? 0) + qty;
        setGroupCartItem(
          groupSession.code,
          groupSession.member_token,
          item.id,
          newQty,
          cleanNote
        ).then((result) => {
          if (!result.ok) {
            // 410 = cart expired / submitted / cancelled — clear stale session
            if (result.error?.includes('dikirim') || result.error?.includes('kedaluwarsa') || result.error?.includes('dibatalkan')) {
              clearLocalGroupSession();
              setGroupSession(null);
              router.replace('/menu');
            }
            setGroupCartMutationError(result.error ?? 'Gagal menambahkan item ke keranjang bersama.');
          } else {
            refreshGroupCart();
          }
        });
        return;
      }

      const lineKey = getItemLineKey(item.id, cleanNote, selectedOptions);

      setCart((prev) => {
        const existing = prev.find((c) => c.lineKey === lineKey);
        let next: CartItem[];
        if (existing) {
          next = prev.map((c) =>
            c.lineKey === lineKey ? { ...c, quantity: c.quantity + qty } : c,
          );
        } else {
          next = [
            ...prev,
            {
              ...item,
              lineKey,
              quantity: qty,
              note: cleanNote || undefined,
              selectedOptions: selectedOptions || undefined,
            },
          ];
        }
        try {
          localStorage.setItem(CART_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [isGroupMode, groupSession, groupCart, refreshGroupCart],
  );

  const addToCart = useCallback(
    (item: MenuItem) => {
      // Defense in depth: refuse sold-out items
      if (item.sold_out) return;
      addToCartWithNote(item, null, 1);
    },
    [addToCartWithNote],
  );

  const removeFromCart = useCallback(
    (lineKey: string) => {
      if (isGroupMode && groupSession && groupCart) {
        const target = groupCart.items.find(
          (i) => i.id === lineKey || getItemLineKey(i.menu_item_id, i.note) === lineKey
        );
        if (target) {
          if (target.member_id === groupSession.member_id) {
            setGroupCartItem(
              groupSession.code,
              groupSession.member_token,
              target.menu_item_id,
              0,
              target.note
            ).then((result) => {
              if (!result.ok) {
                if (result.error?.includes('dikirim') || result.error?.includes('kedaluwarsa') || result.error?.includes('dibatalkan')) {
                  clearLocalGroupSession();
                  setGroupSession(null);
                  router.replace('/menu');
                }
                setGroupCartMutationError(result.error ?? 'Gagal menghapus item.');
              } else {
                refreshGroupCart();
              }
            });
          } else if (iAmHost) {
            removeGroupCartItem(
              groupSession.code,
              groupSession.member_token,
              target.id
            ).then((result) => {
              if (!result.ok) {
                setGroupCartMutationError(result.error ?? 'Gagal menghapus item.');
              } else {
                refreshGroupCart();
              }
            });
          }
        }
        return;
      }

      setCart((prev) => {
        const next = prev.filter((c) => c.lineKey !== lineKey);
        try {
          localStorage.setItem(CART_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [isGroupMode, groupSession, groupCart, iAmHost, refreshGroupCart],
  );

  const updateQuantity = useCallback(
    (lineKey: string, delta: number) => {
      if (isGroupMode && groupSession && groupCart) {
        const target = groupCart.items.find(
          (i) =>
            (i.id === lineKey || getItemLineKey(i.menu_item_id, i.note) === lineKey) &&
            i.member_id === groupSession.member_id
        );
        if (target) {
          const newQty = Math.max(0, target.quantity + delta);
          setGroupCartItem(
            groupSession.code,
            groupSession.member_token,
            target.menu_item_id,
            newQty,
            target.note
          ).then((result) => {
            if (!result.ok) {
              if (result.error?.includes('dikirim') || result.error?.includes('kedaluwarsa') || result.error?.includes('dibatalkan')) {
                clearLocalGroupSession();
                setGroupSession(null);
                router.replace('/menu');
              }
              setGroupCartMutationError(result.error ?? 'Gagal mengubah jumlah item.');
            } else {
              refreshGroupCart();
            }
          });
        }
        return;
      }

      setCart((prev) => {
        const next = prev
          .map((c) => (c.lineKey === lineKey ? { ...c, quantity: c.quantity + delta } : c))
          .filter((c) => c.quantity > 0);
        try {
          localStorage.setItem(CART_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [isGroupMode, groupSession, groupCart, refreshGroupCart],
  );

  const editCartItemNote = useCallback(
    (oldLineKey: string, newNote: string) => {
      const cleanNote = normalizeNote(newNote);
      if (isGroupMode && groupSession && groupCart) {
        const target = groupCart.items.find(
          (i) =>
            (i.id === oldLineKey || getItemLineKey(i.menu_item_id, i.note) === oldLineKey) &&
            i.member_id === groupSession.member_id
        );
        if (target) {
          if ((target.note || null) === cleanNote) return;
          setGroupCartItem(
            groupSession.code,
            groupSession.member_token,
            target.menu_item_id,
            0,
            target.note
          ).then(() => {
            setGroupCartItem(
              groupSession.code,
              groupSession.member_token,
              target.menu_item_id,
              target.quantity,
              cleanNote
            ).then(() => {
              refreshGroupCart();
            });
          });
        }
        return;
      }

      setCart((prev) => {
        const target = prev.find((c) => c.lineKey === oldLineKey);
        if (!target) return prev;

        const newLineKey = getItemLineKey(target.id, cleanNote);
        let next: CartItem[];

        if (oldLineKey === newLineKey) {
          return prev;
        }

        // If another line already has this exact lineKey, merge quantities
        const existingWithNewKey = prev.find((c) => c.lineKey === newLineKey);
        if (existingWithNewKey) {
          next = prev
            .filter((c) => c.lineKey !== oldLineKey)
            .map((c) =>
              c.lineKey === newLineKey
                ? { ...c, quantity: c.quantity + target.quantity }
                : c,
            );
        } else {
          next = prev.map((c) =>
            c.lineKey === oldLineKey
              ? { ...c, lineKey: newLineKey, note: cleanNote || undefined }
              : c,
          );
        }

        try {
          localStorage.setItem(CART_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [isGroupMode, groupSession, groupCart, refreshGroupCart],
  );

  const cartCount = isGroupMode && groupCart
    ? groupCart.items.reduce((sum, c) => sum + c.quantity, 0)
    : cart.reduce((sum, c) => sum + c.quantity, 0);

  const cartTotal = isGroupMode && groupCart
    ? groupCart.total
    : cart.reduce((sum, c) => sum + (c.price + calculateOptionsTotal(c.selectedOptions)) * c.quantity, 0);

  const goToCheckout = useCallback(() => {
    if (hasUnavailableItems) return;
    if (isPaused) return;
    if (!tableNumber) {
      setScannerOpen(true);
      return;
    }
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    localStorage.setItem(TABLE_KEY, tableNumber);
    if (branchId) localStorage.setItem(BRANCH_KEY, branchId);

    const params = new URLSearchParams();
    if (tableNumber) params.set('table', tableNumber);
    if (branchId) params.set('branch', branchId);
    if (groupSession) params.set('group', groupSession.code);
    const qs = params.toString();
    router.push(qs ? `/checkout?${qs}` : '/checkout');
  }, [cart, tableNumber, branchId, router, hasUnavailableItems, isPaused, groupSession]);

  return (
    <div className="min-h-screen bg-cream">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-cream/80 backdrop-blur-xl border-b border-coffee-100/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <a
              href="/"
              className="flex items-center gap-2 text-coffee-700 hover:text-coffee-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-semibold text-sm hidden sm:inline">Kembali ke Home</span>
            </a>

            <div className="flex items-center gap-2">
              {tableNumber ? (
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-coffee-50 border border-coffee-200/70 text-coffee-800 text-xs sm:text-sm font-semibold hover:bg-coffee-100/80 transition-all active:scale-95 group"
                  title={`Terhubung ke Meja ${tableNumber}. Klik untuk scan meja baru jika pindah meja.`}
                >
                  <QrCode className="w-4 h-4 text-coffee-600" />
                  <span className="hidden sm:inline">Meja {tableNumber}</span>
                  <span className="sm:hidden">{tableNumber}</span>
                  <span className="hidden sm:inline-flex items-center gap-0.5 text-[11px] text-coffee-700 font-medium bg-coffee-100/90 px-1.5 py-0.5 rounded border border-coffee-200/50 ml-0.5 group-hover:bg-coffee-200/70">
                    <RefreshCw className="w-2.5 h-2.5 text-coffee-600" /> Pindah
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200/80 text-amber-800 text-xs sm:text-sm font-medium hover:bg-amber-100/70 transition-colors"
                  title="Scan QR code di meja untuk memesan"
                >
                  <Camera className="w-4 h-4 text-amber-600" />
                  <span className="hidden sm:inline">Scan Meja</span>
                  <span className="sm:hidden">Scan</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Pesan Bareng button */}
              {tableNumber && !isGroupMode && (
                <button
                  type="button"
                  onClick={() => setStartGroupSheetOpen(true)}
                  className="flex items-center gap-1.5 px-3 h-10 rounded-xl bg-coffee-50 border border-coffee-200/70 text-coffee-800 hover:bg-coffee-100/70 transition-colors active:scale-95"
                  title="Pesan bareng teman di meja yang sama"
                  aria-label="Pesan Bareng"
                >
                  <Users className="w-4 h-4 text-coffee-700" />
                  <span className="hidden sm:inline text-xs font-bold text-coffee-900">Pesan Bareng</span>
                </button>
              )}

              {/* Group mode: show member count */}
              {isGroupMode && (
                <button
                  type="button"
                  onClick={() => setMemberSheetOpen(true)}
                  className="flex items-center gap-1.5 px-3 h-10 rounded-xl bg-coffee-700/10 border border-coffee-700/30 text-coffee-800 hover:bg-coffee-700/20 transition-colors active:scale-95"
                  title="Lihat anggota grup"
                >
                  <Users className="w-4 h-4 text-coffee-700" />
                  <span className="text-xs font-bold text-coffee-900">
                    {groupCart?.members.length ?? '\u2026'}
                  </span>
                </button>
              )}

              <button
                onClick={() => router.push('/orders')}
                className="flex items-center justify-center gap-1.5 px-3 h-10 rounded-xl bg-coffee-50 border border-coffee-200/70 text-coffee-800 hover:bg-coffee-100/70 transition-colors active:scale-95"
                title="Riwayat Pesanan Saya"
                aria-label="Riwayat Pesanan"
              >
                <Receipt className="w-4 h-4 text-coffee-700" />
                <span className="hidden sm:inline text-xs font-bold text-coffee-900">Riwayat</span>
              </button>

              <button
                onClick={() => setCartOpen(true)}
                className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-coffee-700 text-cream hover:bg-coffee-800 transition-colors active:scale-95"
                aria-label="Cart"
              >
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>


      {/* Group mode banner */}
      <AnimatePresence>
        {isGroupMode && groupCart && (
          <motion.div
            key="group-banner"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-coffee-700 text-cream overflow-hidden"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="font-semibold truncate">
                  {isAwaitingOrderCode ? (
                    <span className="inline-flex items-center gap-1.5 text-amber-200">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Pesanan sedang dikirim...
                    </span>
                  ) : (
                    <>
                      Pesan Bareng &middot; {groupCart.members.length} orang &middot;&nbsp;
                      {groupCart.members.every((m) => m.is_ready) && groupCart.members.length > 1
                        ? <span className="text-green-300 font-bold">Semua siap!</span>
                        : <span>{groupCart.members.filter((m) => m.is_ready).length} siap</span>
                      }
                    </>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {!isAwaitingOrderCode && (
                  <>
                    {/* Toggle ready */}
                    <button
                      type="button"
                      onClick={() => handleToggleReady(!(myMember?.is_ready))}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                        myMember?.is_ready
                          ? 'bg-green-400/20 text-green-200 border border-green-400/40 hover:bg-green-400/30'
                          : 'bg-cream/15 text-cream border border-cream/30 hover:bg-cream/25'
                      }`}
                      title={myMember?.is_ready ? 'Batalkan siap' : 'Tandai siap pesan'}
                    >
                      <UserCheck className="w-3 h-3" />
                      {myMember?.is_ready ? 'Siap' : 'Belum siap'}
                    </button>
                    {/* Invite */}
                    <button
                      type="button"
                      onClick={() => setInviteSheetOpen(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cream/15 hover:bg-cream/25 text-cream border border-cream/30 font-bold text-[11px] transition-colors"
                    >
                      <Share2 className="w-3 h-3" />
                      Ajak
                    </button>
                  </>
                )}
                {/* Members */}
                <button
                  type="button"
                  onClick={() => setMemberSheetOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cream/15 hover:bg-cream/25 text-cream border border-cream/30 font-bold text-[11px] transition-colors"
                >
                  <Users className="w-3 h-3" />
                  Anggota
                </button>
                {/* Checkout group */}
                {iAmHost && !isAwaitingOrderCode && (
                  <button
                    type="button"
                    onClick={() => {
                      const params = new URLSearchParams();
                      params.set('group', groupSession!.code);
                      if (tableNumber) params.set('table', tableNumber);
                      if (branchId) params.set('branch', branchId!);
                      router.push(`/checkout?${params.toString()}`);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cream text-coffee-800 font-bold text-[11px] hover:bg-cream/90 transition-colors active:scale-95"
                  >
                    Checkout
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table status banner */}
      {tableNumber ? (
        <div className="bg-coffee-50/70 border-b border-coffee-100/60 px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs text-coffee-800">
            <div className="flex items-center gap-2">
              <QrCode className="w-3.5 h-3.5 text-coffee-600 flex-shrink-0" />
              <span>
                Terhubung ke <strong>Meja {tableNumber}</strong> via scan QR code.
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="hidden sm:inline text-[11px] text-coffee-600/70">Pindah tempat?</span>
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-coffee-100 hover:bg-coffee-200/80 text-coffee-900 font-bold text-xs transition-colors active:scale-95 shadow-2xs"
                title="Pindah meja dan scan stiker QR di meja baru"
              >
                <RefreshCw className="w-3 h-3 text-coffee-700" />
                <span>Pindah Meja</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50/90 border-b border-amber-200/60 px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs sm:text-sm text-amber-900">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>
                <strong>Belum scan QR meja.</strong> Pemesanan hanya dapat dilakukan setelah memindai QR code di meja.
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 transition-colors shadow-soft"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Scan di Web</span>
              </button>
              <button
                type="button"
                onClick={() => setShowQrGuide(true)}
                className="whitespace-nowrap font-bold underline hover:text-amber-950 text-xs"
              >
                Panduan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause banner — ordering temporarily closed */}
      {isPaused && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border-b-2 border-amber-300 px-4 py-3"
        >
          <div className="max-w-7xl mx-auto flex items-start gap-2.5 text-sm text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p>
              <strong>Pemesanan Sedang Dijeda ☕</strong>{' '}
              <span className="font-normal">{pauseMsg}</span>
            </p>
          </div>
        </motion.div>
      )}

      {/* Table change toast / notice */}
      <AnimatePresence>
        {tableChangeNotice && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-emerald-50 border-b border-emerald-200 px-4 py-2.5 text-emerald-900 text-xs sm:text-sm overflow-hidden"
          >
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="font-semibold">{tableChangeNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setTableChangeNotice(null)}
                className="text-emerald-700 hover:text-emerald-950 p-1 flex-shrink-0"
                aria-label="Tutup notifikasi"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Group cart mutation error toast (e.g. 410 expired / stuck session) */}
      <AnimatePresence>
        {groupCartMutationError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-red-50 border-b border-red-200 px-4 py-2.5 text-red-900 text-xs sm:text-sm overflow-hidden"
          >
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="font-semibold">{groupCartMutationError}</span>
              </div>
              <button
                type="button"
                onClick={() => setGroupCartMutationError(null)}
                className="text-red-600 hover:text-red-900 p-1 flex-shrink-0"
                aria-label="Tutup notifikasi"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Group cart submitting status banner */}
      <AnimatePresence>
        {isAwaitingOrderCode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-amber-900 text-xs sm:text-sm overflow-hidden"
          >
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-amber-600 animate-spin flex-shrink-0" />
                <span className="font-semibold">Pesanan sedang dikirim...</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero header */}
      <div className="bg-gradient-to-b from-sand-100/60 to-cream pt-12 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="text-sm font-semibold text-coffee-600 uppercase tracking-wider">
              Menu {brandName}
            </span>
            <h1 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-coffee-900 tracking-tight">
              Pilih kesukaanmu
            </h1>
            <p className="mt-3 text-charcoal/60 text-base sm:text-lg max-w-2xl">
              Scan barcode di meja, pilih menu, bayar dari HP. Pesanan
              langsung dibuat barista dan diantar ke meja kamu.
            </p>

            {/* Smart queue wait time display */}
            {branchInfo?.est_wait_minutes && branchInfo.est_wait_minutes > 0 && branchInfo.est_wait_now != null && (
              <div className="mt-4 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white border border-coffee-200/80 shadow-2xs text-xs font-semibold text-coffee-900">
                <Clock className="w-3.5 h-3.5 text-coffee-600 flex-shrink-0" />
                <span>
                  {(branchInfo.queue_count ?? 0) > 0
                    ? `Antrean saat ini: ${branchInfo.queue_count} pesanan · perkiraan ±${roundToFiveMinutes(branchInfo.est_wait_now)} menit`
                    : `Perkiraan waktu tunggu: ±${roundToFiveMinutes(branchInfo.est_wait_now)} menit`}
                </span>
              </div>
            )}

            {/* Wi-Fi & Jam Buka card — only shown when a branch is known */}
            {/* {branchId && (
              <div className="mt-5 max-w-md">
                <WifiInfoCard branchId={branchId} />
              </div>
            )} */}
          </motion.div>

          {/* Search */}
          <div className="relative mt-6 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-charcoal/40" />
            <input
              type="text"
              placeholder="Cari menu... (kopi, nasi, lassi)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl bg-white border border-coffee-100 text-charcoal text-sm placeholder:text-charcoal/40 focus:outline-none focus:border-coffee-400 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Category tabs */}
      <div className="sticky top-16 z-30 bg-cream/90 backdrop-blur-md border-b border-coffee-100/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide py-3">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all active:scale-95 ${
                  activeCategory === cat.id
                    ? 'bg-coffee-700 text-cream shadow-soft'
                    : 'bg-white text-charcoal/60 hover:bg-coffee-50 border border-coffee-100'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Menu grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 sm:py-8 pb-32">
        {loading ? (
          <div className="bg-white rounded-2xl px-4 border border-coffee-100/80 shadow-soft-xs flex flex-col sm:bg-transparent sm:border-0 sm:shadow-none sm:rounded-none sm:p-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="border-b border-coffee-100 last:border-b-0 py-3.5 pb-4 flex flex-row items-start justify-between gap-3 animate-pulse sm:border-b-0 sm:p-0 sm:pb-0 sm:gap-0 sm:flex-col sm:bg-white sm:rounded-2xl sm:overflow-hidden sm:border sm:border-coffee-100/80"
              >
                <div className="flex-1 min-w-0 space-y-2 sm:order-2 sm:p-5 sm:space-y-3">
                  <div className="h-4 bg-coffee-50 rounded w-3/4" />
                  <div className="h-3 bg-coffee-50 rounded w-full" />
                  <div className="h-3.5 bg-coffee-50 rounded w-1/3 sm:hidden mt-2" />
                  <div className="h-3 bg-coffee-50 rounded w-1/2 hidden sm:block" />
                </div>
                <div className="relative flex-shrink-0 sm:order-1 sm:w-full">
                  <div className="w-[84px] h-[84px] rounded-xl bg-coffee-50 sm:w-full sm:h-auto sm:aspect-[4/5] sm:rounded-none" />
                  <div className="w-7 h-7 rounded-full bg-coffee-100 border border-coffee-200 absolute -bottom-3 left-1/2 -translate-x-1/2 sm:hidden" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-charcoal/60 text-lg">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-6 py-3 rounded-xl bg-coffee-700 text-cream font-semibold hover:bg-coffee-800 transition-colors"
            >
              Coba lagi
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-charcoal/50 text-lg">Menu tidak ditemukan. Coba kata kunci lain.</p>
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="bg-white rounded-2xl px-4 border border-coffee-100/80 shadow-soft-xs flex flex-col sm:bg-transparent sm:border-0 sm:shadow-none sm:rounded-none sm:p-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-5"
          >
            {sortedItems.map((item) => {
              const handleAddItem = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (isPaused) return;
                if (isGroupMode) {
                  const optionGroups = Array.isArray(item.options) ? (item.options as ItemOptionGroup[]) : [];
                  if (optionGroups.length > 0) {
                    toast.error('Pesan Bareng belum mendukung menu dengan opsi tambahan. Silakan pesan menu ini secara terpisah.', { duration: 3500 });
                    return;
                  }
                }
                // Items with required options must go through the detail popup
                const optionGroups = Array.isArray(item.options) ? (item.options as ItemOptionGroup[]) : [];
                const hasRequired = optionGroups.some((g) => g.required);
                if (hasRequired) {
                  setDetailTarget(item);
                } else {
                  addToCart(item);
                }
              };

              return (
                <motion.div
                  key={item.id}
                  variants={fadeInUp}
                  whileHover={item.sold_out || !canHover ? undefined : { y: -6 }}
                  className={`group transition-shadow duration-300 flex cursor-pointer
                    border-b border-coffee-100 last:border-b-0 py-3.5 pb-4 flex-row items-start justify-between gap-3 relative
                    sm:flex-col sm:p-0 sm:gap-0 sm:border sm:border-coffee-100/80 sm:rounded-2xl sm:overflow-hidden sm:bg-white
                    ${item.sold_out ? 'opacity-75 sm:opacity-75' : 'sm:hover:shadow-soft-lg'}`}
                  onClick={() => setDetailTarget(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setDetailTarget(item); } }}
                  aria-label={item.sold_out ? `${item.name}, habis — lihat detail` : `${item.name} — lihat detail dan tambah ke pesanan`}
                >
                  {/* LEFT: Text column on mobile (order-2 on desktop) */}
                  <div className="flex-1 min-w-0 pr-2 sm:pr-0 sm:order-2 sm:p-5 sm:flex sm:flex-col sm:flex-1">
                    {/* Badge: plain text on mobile only */}
                    {!item.sold_out && item.badge ? (
                      <span className="block sm:hidden text-[11px] font-semibold text-amber-600 mb-0.5">
                        {item.badge}
                      </span>
                    ) : null}

                    <h3
                      className={`text-[15px] sm:text-base font-semibold sm:font-bold leading-snug line-clamp-2 sm:line-clamp-none sm:mb-1 ${
                        item.sold_out ? 'text-charcoal/40' : 'text-coffee-900'
                      }`}
                    >
                      {item.name}
                    </h3>

                    <p
                      className={`text-xs sm:text-sm leading-relaxed line-clamp-2 mt-0.5 sm:mt-0 sm:mb-4 sm:flex-1 ${
                        item.sold_out ? 'text-charcoal/35' : 'text-charcoal/50'
                      }`}
                    >
                      {item.description}
                    </p>

                    {/* Price on mobile (under description) */}
                    <div className="sm:hidden mt-2">
                      <span
                        className={`text-sm font-semibold ${
                          item.sold_out ? 'text-charcoal/40' : 'text-coffee-900'
                        }`}
                      >
                        {formatPrice(item.price)}
                      </span>
                    </div>

                    {/* Desktop price and action (hidden on mobile, visible on sm+) */}
                    <div className="hidden sm:flex items-center justify-between mt-auto">
                      <span
                        className={`text-lg font-extrabold ${
                          item.sold_out ? 'text-charcoal/40' : 'text-coffee-700'
                        }`}
                      >
                        {formatPrice(item.price)}
                      </span>
                      {item.sold_out ? (
                        <span
                          className="px-3 py-1.5 rounded-xl bg-charcoal/10 text-charcoal/50 text-xs font-bold cursor-not-allowed select-none"
                          aria-hidden="true"
                        >
                          Habis
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isPaused}
                          onClick={handleAddItem}
                          className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all active:scale-90 ${
                            isPaused
                              ? 'bg-charcoal/10 text-charcoal/35 cursor-not-allowed'
                              : 'bg-coffee-50 text-coffee-700 hover:bg-coffee-700 hover:text-cream'
                          }`}
                          aria-label={isPaused ? 'Pemesanan dijeda' : `Tambah ${item.name}`}
                          title={isPaused ? 'Pemesanan sedang dijeda' : 'Tambah ke pesanan'}
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* RIGHT: Photo column on mobile (order-1 on desktop) */}
                  <div className="relative flex-shrink-0 sm:order-1 sm:w-full">
                    <div className="relative w-[84px] h-[84px] flex-shrink-0 rounded-xl overflow-hidden bg-coffee-50 sm:w-full sm:h-auto sm:aspect-[4/5] sm:rounded-none">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className={`w-full h-full object-cover transition-transform duration-500 ${
                            item.sold_out
                              ? 'grayscale opacity-60 sm:contrast-75 sm:opacity-70'
                              : 'sm:group-hover:scale-110'
                          }`}
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-coffee-200">
                          <QrCode className="w-8 h-8 sm:w-12 sm:h-12" />
                        </div>
                      )}

                      {/* Desktop overlay badges only (hidden on mobile) */}
                      {item.sold_out ? (
                        <span className="hidden sm:flex absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold bg-charcoal/85 text-white backdrop-blur-sm shadow-xs border border-white/20 items-center gap-1">
                          Habis
                        </span>
                      ) : item.badge ? (
                        <span
                          className={`hidden sm:inline-block absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold ${
                            item.badge === 'Bestseller'
                              ? 'bg-coffee-700 text-cream'
                              : 'bg-sand-300 text-coffee-900'
                          }`}
                        >
                          {item.badge}
                        </span>
                      ) : null}
                    </div>

                    {/* Mobile action button or Habis label overlapping photo bottom edge (hidden on sm+) */}
                    <div className="sm:hidden absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center">
                      {item.sold_out ? (
                        <span
                          className="text-xs font-semibold text-charcoal/40 bg-white/95 px-2 py-0.5 rounded-full border border-coffee-100 shadow-2xs whitespace-nowrap select-none"
                          aria-hidden="true"
                        >
                          Habis
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isPaused}
                          onClick={handleAddItem}
                          className={`relative flex items-center justify-center w-7 h-7 rounded-full bg-white border border-coffee-700 text-coffee-700 shadow-xs active:scale-90 transition-transform after:absolute after:-inset-2 after:content-[''] ${
                            isPaused ? 'opacity-40 cursor-not-allowed' : ''
                          }`}
                          aria-label={isPaused ? 'Pemesanan dijeda' : `Tambah ${item.name}`}
                          title={isPaused ? 'Pemesanan sedang dijeda' : 'Tambah ke pesanan'}
                        >
                          <Plus className="w-4 h-4 text-coffee-700" />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Cart drawer */}
      <AnimatePresence>
        {cartOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCartOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-cream z-50 flex flex-col shadow-soft-xl"
            >
              {/* Cart header */}
              <div className="flex items-center justify-between p-5 border-b border-coffee-100">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-coffee-700" />
                  <h2 className="text-lg font-bold text-coffee-900">Pesanan kamu</h2>
                  {cartCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-coffee-100 text-coffee-700 text-xs font-bold">
                      {cartCount}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setCartOpen(false)}
                  className="w-9 h-9 rounded-lg hover:bg-coffee-50 flex items-center justify-center text-coffee-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Cart items */}
              <div className="flex-1 overflow-y-auto p-5">
                {isGroupMode && groupCart ? (
                  groupCart.items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <div className="w-16 h-16 rounded-2xl bg-coffee-50 flex items-center justify-center mb-4">
                        <Users className="w-8 h-8 text-coffee-300" />
                      </div>
                      <p className="text-charcoal/50 font-medium">Pesanan bersama masih kosong</p>
                      <p className="text-charcoal/40 text-sm mt-1">Pilih menu di atas untuk mulai memesan bareng</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* My items */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-coffee-900 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-coffee-700"></span>
                            Pesananmu ({groupSession?.name})
                          </h3>
                          <span className="text-xs font-semibold text-coffee-700">
                            {groupCart.items.filter(i => i.member_id === groupSession?.member_id).reduce((s, i) => s + i.quantity, 0)} item
                          </span>
                        </div>
                        {groupCart.items.filter(i => i.member_id === groupSession?.member_id).length === 0 ? (
                          <p className="text-xs text-charcoal/40 italic p-3 bg-white/60 rounded-xl border border-coffee-100/60">
                            Kamu belum memilih menu. Klik tombol + pada menu untuk menambahkan.
                          </p>
                        ) : (
                          groupCart.items.filter(i => i.member_id === groupSession?.member_id).map((item) => (
                            <div key={item.id} className="flex flex-col gap-2 rounded-xl p-3 border shadow-soft bg-white border-coffee-100/60">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-lg overflow-hidden bg-coffee-50 flex-shrink-0">
                                  {item.image_url && (
                                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-sm truncate text-coffee-900">{item.name}</p>
                                  <p className="text-sm font-bold text-coffee-600">
                                    {formatPrice(item.effective_price || item.price)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => updateQuantity(item.id, -1)}
                                    className="w-8 h-8 rounded-lg bg-coffee-50 text-coffee-700 flex items-center justify-center hover:bg-coffee-100 transition-colors active:scale-90"
                                    title="Kurangi"
                                  >
                                    <Minus className="w-4 h-4" />
                                  </button>
                                  <span className="font-bold text-coffee-900 w-6 text-center">
                                    {item.quantity}
                                  </span>
                                  <button
                                    onClick={() => updateQuantity(item.id, 1)}
                                    className="w-8 h-8 rounded-lg bg-coffee-50 text-coffee-700 hover:bg-coffee-100 flex items-center justify-center transition-colors active:scale-90"
                                    title="Tambah"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => removeFromCart(item.id)}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-charcoal/30 hover:text-red-500 hover:bg-red-50 transition-colors"
                                    title="Hapus"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                              {item.note && (
                                <div className="pt-1 border-t border-coffee-50 text-xs text-amber-800 bg-amber-50/50 rounded px-2 py-0.5">
                                  Catatan: {item.note}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>

                      {/* Friends items */}
                      {groupCart.items.filter(i => i.member_id !== groupSession?.member_id).length > 0 && (
                        <div className="space-y-3 pt-3 border-t border-coffee-200/50">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-charcoal/60 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-coffee-600" />
                            Pesanan Teman
                          </h3>
                          <div className="space-y-2">
                            {groupCart.items.filter(i => i.member_id !== groupSession?.member_id).map((item) => (
                              <div key={item.id} className="flex items-center justify-between p-2.5 rounded-xl bg-coffee-50/50 border border-coffee-100/40 text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="px-1.5 py-0.5 rounded bg-coffee-100 font-bold text-[10px] text-coffee-800">
                                    {item.member_name}
                                  </span>
                                  <span className="font-semibold text-coffee-900 truncate">{item.name}</span>
                                  {item.note && <span className="text-charcoal/50 text-[11px]">({item.note})</span>}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="text-charcoal/60">×{item.quantity}</span>
                                  <span className="font-bold text-coffee-700">
                                    {formatPrice((item.effective_price || item.price) * item.quantity)}
                                  </span>
                                  {iAmHost && (
                                    <button
                                      type="button"
                                      onClick={() => removeFromCart(item.id)}
                                      className="p-1 text-charcoal/30 hover:text-red-600 transition-colors"
                                      title="Hapus item anggota ini"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <div className="w-16 h-16 rounded-2xl bg-coffee-50 flex items-center justify-center mb-4">
                        <ShoppingCart className="w-8 h-8 text-coffee-300" />
                      </div>
                      <p className="text-charcoal/50 font-medium">Pesanan masih kosong</p>
                      <p className="text-charcoal/40 text-sm mt-1">Pilih menu di atas untuk mulai</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {cart.map((item) => {
                        const unavailable = isLineUnavailable(item.id);
                        return (
                          <div
                            key={item.lineKey}
                            className={`flex flex-col gap-2 rounded-xl p-3 border shadow-soft transition-colors ${
                              unavailable
                                ? 'bg-stone-50 border-stone-200/80'
                                : 'bg-white border-coffee-100/60'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-14 h-14 rounded-lg overflow-hidden bg-coffee-50 flex-shrink-0">
                                {item.image_url && (
                                  <img
                                    src={item.image_url}
                                    alt={item.name}
                                    className={`w-full h-full object-cover ${
                                      unavailable ? 'grayscale contrast-75 opacity-70' : ''
                                    }`}
                                  />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className={`font-semibold text-sm truncate ${
                                    unavailable ? 'text-charcoal/50' : 'text-coffee-900'
                                  }`}>
                                    {item.name}
                                  </p>
                                  {unavailable && (
                                    <span className="px-2 py-0.5 rounded-md bg-charcoal/10 text-charcoal/70 border border-charcoal/20 text-[10px] font-bold uppercase tracking-wider">
                                      Habis
                                    </span>
                                  )}
                                </div>
                                {item.selectedOptions && formatItemOptionsSummary(item.selectedOptions) && (
                                  <p className="text-xs text-coffee-700 font-medium mt-0.5">
                                    {formatItemOptionsSummary(item.selectedOptions)}
                                  </p>
                                )}
                                <p
                                  className={`text-sm font-bold ${
                                    unavailable ? 'text-charcoal/40 line-through' : 'text-coffee-600'
                                  }`}
                                >
                                  {formatPrice((item.price + calculateOptionsTotal(item.selectedOptions)) * item.quantity)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => updateQuantity(item.lineKey, -1)}
                                  className="w-8 h-8 rounded-lg bg-coffee-50 text-coffee-700 flex items-center justify-center hover:bg-coffee-100 transition-colors active:scale-90"
                                  title="Kurangi"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <span className="font-bold text-coffee-900 w-6 text-center">
                                  {item.quantity}
                                </span>
                                <button
                                  onClick={() => updateQuantity(item.lineKey, 1)}
                                  disabled={unavailable}
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                    unavailable
                                      ? 'bg-coffee-50/40 text-charcoal/25 cursor-not-allowed'
                                      : 'bg-coffee-50 text-coffee-700 hover:bg-coffee-100 active:scale-90'
                                  }`}
                                  title={unavailable ? 'Menu habis' : 'Tambah'}
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* Note badge / Add note trigger */}
                            <div className="flex items-center justify-between pt-1 border-t border-coffee-50 text-xs">
                              {item.note ? (
                                <button
                                  type="button"
                                  disabled={unavailable}
                                  onClick={() =>
                                    setNoteModalTarget({
                                      item,
                                      initialNote: item.note || '',
                                      lineKeyToEdit: item.lineKey,
                                      isEditing: true,
                                    })
                                  }
                                  className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 text-left transition-colors max-w-full ${
                                    unavailable
                                      ? 'text-charcoal/40 bg-stone-100 border border-stone-200 cursor-not-allowed'
                                      : 'text-amber-800 bg-amber-50/80 hover:bg-amber-100/80 border border-amber-200/60'
                                  }`}
                                  title={unavailable ? 'Menu habis' : 'Klik untuk ubah catatan'}
                                >
                                  <MessageSquare className="w-3 h-3 text-amber-600 flex-shrink-0" />
                                  <span className="truncate">{item.note}</span>
                                  {!unavailable && (
                                    <Pencil className="w-2.5 h-2.5 text-amber-600/70 ml-1 flex-shrink-0" />
                                  )}
                                </button>
                              ) : (
                                !unavailable && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setNoteModalTarget({
                                        item,
                                        initialNote: '',
                                        lineKeyToEdit: item.lineKey,
                                        isEditing: true,
                                      })
                                    }
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-coffee-600 hover:text-coffee-800 hover:bg-coffee-50 px-2 py-0.5 rounded transition-colors"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Tambah Catatan (less sugar, es, dll)</span>
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </div>

              {/* Cart footer */}
              {isGroupMode && groupCart ? (
                groupCart.items.length > 0 && (
                  <div className="border-t border-coffee-100 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-charcoal/60 text-sm">Total Gabungan</span>
                      <span className="text-2xl font-extrabold text-coffee-800">
                        {formatPrice(groupCart.total)}
                      </span>
                    </div>

                    {tableNumber && (
                      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-coffee-50 text-coffee-700 text-xs">
                        <div className="flex items-center gap-2">
                          <QrCode className="w-4 h-4 flex-shrink-0 text-coffee-600" />
                          <span>
                            Pesanan Meja <strong className="font-bold text-coffee-900">{tableNumber}</strong>
                          </span>
                        </div>
                      </div>
                    )}

                    {iAmHost ? (
                      <button
                        onClick={goToCheckout}
                        disabled={groupCart.items.length === 0 || isPaused || isAwaitingOrderCode}
                        className={`w-full py-4 rounded-xl font-bold transition-colors shadow-soft ${
                          isPaused || isAwaitingOrderCode
                            ? 'bg-charcoal/20 text-charcoal/40 cursor-not-allowed'
                            : 'bg-coffee-700 text-cream hover:bg-coffee-800 active:scale-95'
                        }`}
                      >
                        {isAwaitingOrderCode ? (
                          <span className="inline-flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Pesanan sedang dikirim...
                          </span>
                        ) : isPaused ? (
                          'Pemesanan Sedang Dijeda'
                        ) : (
                          `Checkout Pesanan Bareng — ${formatPrice(groupCart.total)}`
                        )}
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => handleToggleReady(!myMember?.is_ready)}
                          disabled={isAwaitingOrderCode}
                          className={`w-full py-3.5 rounded-xl font-bold text-sm transition-colors active:scale-95 flex items-center justify-center gap-2 ${
                            isAwaitingOrderCode
                              ? 'bg-charcoal/20 text-charcoal/40 cursor-not-allowed'
                              : myMember?.is_ready
                                ? 'bg-green-600 text-white hover:bg-green-700'
                                : 'bg-coffee-700 text-cream hover:bg-coffee-800'
                          }`}
                        >
                          {isAwaitingOrderCode ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Pesanan sedang dikirim...</span>
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-4 h-4" />
                              <span>{myMember?.is_ready ? 'Siap! (Klik jika ingin ubah)' : 'Saya Sudah Selesai Pilih'}</span>
                            </>
                          )}
                        </button>
                        <p className="text-center text-[11px] text-charcoal/50">
                          {isAwaitingOrderCode
                            ? 'Pesanan sedang diproses oleh server, mohon tunggu sebentar...'
                            : `Pesanan akan dikirim oleh host (${groupCart.members.find(m => m.is_host)?.name ?? 'Host'}).`}
                        </p>
                      </div>
                    )}
                  </div>
                )
              ) : (
                cart.length > 0 && (
                  <div className="border-t border-coffee-100 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-charcoal/60 text-sm">Total</span>
                      <span className="text-2xl font-extrabold text-coffee-800">
                        {formatPrice(cartTotal)}
                      </span>
                    </div>

                    {hasUnavailableItems && (
                      <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs space-y-2.5">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                          <span className="font-semibold leading-relaxed">
                            Ada menu yang habis di keranjang. Hapus dulu ya.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={removeUnavailableItems}
                          className="w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors active:scale-95 flex items-center justify-center gap-1.5 shadow-2xs"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus yang habis</span>
                        </button>
                      </div>
                    )}

                    {tableNumber ? (
                      <>
                        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-coffee-50 text-coffee-700 text-xs">
                          <div className="flex items-center gap-2">
                            <QrCode className="w-4 h-4 flex-shrink-0 text-coffee-600" />
                            <span>
                              Pesanan untuk <strong className="font-bold text-coffee-900">Meja {tableNumber}</strong>
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setCartOpen(false);
                              setScannerOpen(true);
                            }}
                            className="inline-flex items-center gap-1 font-bold text-coffee-700 hover:text-coffee-950 bg-coffee-100 hover:bg-coffee-200/80 px-2 py-0.5 rounded text-[11px] transition-colors whitespace-nowrap"
                            title="Pindah meja dan scan stiker QR di meja baru"
                          >
                            <RefreshCw className="w-2.5 h-2.5" /> Ganti
                          </button>
                        </div>
                        <button
                          onClick={goToCheckout}
                          disabled={hasUnavailableItems || isPaused}
                          className={`w-full py-4 rounded-xl font-bold transition-colors shadow-soft ${
                            hasUnavailableItems || isPaused
                              ? 'bg-charcoal/20 text-charcoal/40 cursor-not-allowed'
                              : 'bg-coffee-700 text-cream hover:bg-coffee-800 active:scale-95'
                          }`}
                        >
                          {isPaused ? 'Pemesanan Sedang Dijeda' : `Pesan Sekarang — ${formatPrice(cartTotal)}`}
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs">
                          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold">Scan QR di Mejamu</p>
                            <p className="text-amber-800/80 mt-0.5">
                              Pemesanan hanya dapat diproses setelah memindai QR code di meja.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setScannerOpen(true)}
                          className="w-full py-4 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700 transition-colors active:scale-95 flex items-center justify-center gap-2 shadow-soft"
                        >
                          <Camera className="w-4 h-4" />
                          Scan QR Meja Sekarang
                        </button>
                      </>
                    )}
                  </div>
                )
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* QR Scan Guide Modal */}
      <AnimatePresence>
        {showQrGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-charcoal/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowQrGuide(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-soft-xl border border-coffee-100 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto mb-4">
                <QrCode className="w-8 h-8 text-amber-700" />
              </div>

              <h3 className="text-lg font-bold text-coffee-900">
                Pindai QR Code di Meja
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-charcoal/70 leading-relaxed">
                Pemesanan hanya dapat dilakukan dengan memindai kode QR yang ada di mejamu agar pesanan langsung diantar ke tempat dudukmu.
              </p>

              <div className="mt-5 space-y-2.5 text-left bg-coffee-50/70 rounded-2xl p-4 text-xs text-coffee-900">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-coffee-700 text-cream text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    1
                  </span>
                  <span>Duduk di salah satu meja {brandName} yang tersedia.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-coffee-700 text-cream text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    2
                  </span>
                  <span>Scan QR code meja langsung lewat kamera website ini atau kamera HP.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-coffee-700 text-cream text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    3
                  </span>
                  <span>Menu akan otomatis terhubung dengan nomor mejamu dan siap dipesan!</span>
                </div>
              </div>

              <div className="mt-6 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowQrGuide(false);
                    setScannerOpen(true);
                  }}
                  className="w-full py-3.5 rounded-xl bg-coffee-700 text-cream font-bold text-sm hover:bg-coffee-800 transition-colors active:scale-95 flex items-center justify-center gap-2 shadow-soft"
                >
                  <Camera className="w-4 h-4" />
                  Buka Scanner Kamera Web
                </button>
                <button
                  type="button"
                  onClick={() => setShowQrGuide(false)}
                  className="w-full py-2.5 rounded-xl text-charcoal/60 hover:text-charcoal font-semibold text-xs transition-colors"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* In-website live camera QR Scanner Modal */}
      <QrScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
        currentTable={tableNumber}
        title={tableNumber ? 'Scan QR Meja Baru' : 'Scan QR Code Meja'}
        subtitle={
          tableNumber
            ? `Saat ini terhubung ke Meja ${tableNumber}. Arahkan kamera ke stiker QR meja baru.`
            : 'Arahkan kamera ke stiker QR di meja untuk memesan'
        }
      />

      {/* Floating cart button (mobile) */}
      {cartCount > 0 && !cartOpen && (
        <motion.button
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          onClick={() => setCartOpen(true)}
          style={{ bottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          className="fixed right-4 sm:hidden flex items-center gap-2.5 px-3.5 py-2.5 rounded-full bg-coffee-700 text-cream shadow-soft-lg z-40 active:scale-95 min-h-[40px] text-sm"
          aria-label={`Buka keranjang, ${cartCount} item, total ${formatPrice(cartTotal)}`}
        >
          <div className="relative flex items-center justify-center">
            <ShoppingCart className="w-4 h-4" />
            <span className="absolute -top-1.5 -right-2 bg-amber-400 text-coffee-950 text-[10px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center border border-coffee-700 shadow-xs">
              {cartCount}
            </span>
          </div>
          <span className="font-extrabold text-sm">{formatPrice(cartTotal)}</span>
        </motion.button>
      )}

      {/* Item Note / Customization Modal (for editing cart notes) */}
      <ItemNoteModal
        isOpen={Boolean(noteModalTarget)}
        item={noteModalTarget?.item ?? null}
        initialNote={noteModalTarget?.initialNote ?? ''}
        initialQuantity={noteModalTarget?.initialQuantity ?? 1}
        isEditing={noteModalTarget?.isEditing ?? false}
        onClose={() => setNoteModalTarget(null)}
        onConfirm={(confirmedNote, quantity) => {
          if (!noteModalTarget) return;
          if (noteModalTarget.isEditing && noteModalTarget.lineKeyToEdit) {
            editCartItemNote(noteModalTarget.lineKeyToEdit, confirmedNote);
          } else {
            addToCartWithNote(noteModalTarget.item, confirmedNote, quantity);
          }
        }}
      />

      {/* Product Detail Popup */}
      <ProductDetailModal
        isOpen={Boolean(detailTarget)}
        item={detailTarget}
        allItems={items}
        isPaused={isPaused}
        isGroupMode={isGroupMode}
        onClose={() => setDetailTarget(null)}
        onAddToCart={({ item, note, quantity, selectedOptions }) => {
          addToCartWithNote(item, note, quantity, selectedOptions);
          toast.success(`${item.name} ditambahkan ke pesanan!`, { duration: 2500 });
        }}
        onAddPairingItem={(pairingItem) => {
          const rawOptions = Array.isArray(pairingItem.options) ? (pairingItem.options as ItemOptionGroup[]) : [];
          const hasRequired = rawOptions.some((g) => g.required);
          if (hasRequired) {
            setDetailTarget(pairingItem);
          } else {
            addToCartWithNote(pairingItem, null, 1);
            toast.success(`${pairingItem.name} ditambahkan!`, { duration: 2000 });
          }
        }}
      />

      {/* Table service request button & sheet (only when table is known) */}
      {tableNumber && (
        <TableRequestModal
          tableNumber={tableNumber}
          branchId={branchId}
          positionClassName="bottom-4 bottom-[max(1rem,env(safe-area-inset-bottom,1rem))] left-4 sm:bottom-6 sm:left-6"
        />
      )}

      {/* ── START GROUP SHEET ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {startGroupSheetOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setStartGroupSheetOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-cream rounded-t-3xl shadow-soft-xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-w-lg mx-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-coffee-700/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-coffee-700" />
                  </div>
                  <h2 className="font-extrabold text-coffee-900 text-lg">Pesan Bareng</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setStartGroupSheetOpen(false)}
                  className="w-8 h-8 rounded-lg hover:bg-coffee-50 flex items-center justify-center text-coffee-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {!tableNumber && (
                <div className="mb-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <span>Scan QR code meja dulu sebelum bikin sesi pesan bareng ya.</span>
                </div>
              )}

              <p className="text-sm text-charcoal/60 mb-5 leading-relaxed">
                Buat sesi pesan bareng untuk mejamu. Temanmu bisa join pakai link yang kamu bagikan dan pilih menunya masing-masing!
              </p>

              <form onSubmit={handleCreateGroup} className="space-y-4">
                <div>
                  <label htmlFor="create-group-name" className="block text-xs font-semibold text-charcoal/50 mb-1.5">
                    Namamu
                  </label>
                  <input
                    id="create-group-name"
                    type="text"
                    value={createGroupName}
                    onChange={(e) => setCreateGroupName(e.target.value)}
                    placeholder="Masukkan namamu"
                    maxLength={30}
                    className="w-full px-4 py-3.5 rounded-xl bg-white border border-coffee-200 text-charcoal text-sm placeholder:text-charcoal/40 focus:outline-none focus:border-coffee-500 transition-colors"
                    disabled={creatingGroup}
                  />
                </div>

                {createGroupError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <span>{createGroupError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={creatingGroup || !createGroupName.trim() || !tableNumber}
                  className="w-full py-4 rounded-xl bg-coffee-700 text-cream font-bold text-sm hover:bg-coffee-800 transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-soft flex items-center justify-center gap-2"
                >
                  {creatingGroup ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Membuat sesi...</span>
                    </>
                  ) : (
                    <>
                      <Users className="w-4 h-4" />
                      <span>Buat Sesi Pesan Bareng</span>
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── INVITE SHEET ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {inviteSheetOpen && groupSession && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setInviteSheetOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-cream rounded-t-3xl shadow-soft-xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-w-lg mx-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-coffee-700/10 flex items-center justify-center">
                    <Share2 className="w-5 h-5 text-coffee-700" />
                  </div>
                  <h2 className="font-extrabold text-coffee-900 text-lg">Ajak Temanmu</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setInviteSheetOpen(false)}
                  className="w-8 h-8 rounded-lg hover:bg-coffee-50 flex items-center justify-center text-coffee-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-charcoal/60 mb-4 leading-relaxed">
                Bagikan QR code atau link berikut ke teman di mejamu. Mereka bisa scan/klik untuk langsung pilih menu!
              </p>

              {/* QR Code */}
              {inviteUrl && (
                <div className="flex justify-center mb-5">
                  <div className="p-4 bg-white rounded-2xl border border-coffee-100 shadow-soft">
                    <QRCodeSVG
                      value={inviteUrl}
                      size={160}
                      bgColor="#ffffff"
                      fgColor="#3b1f0a"
                      level="M"
                    />
                  </div>
                </div>
              )}

              {/* Invite code */}
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-coffee-50 border border-coffee-200/80 mb-4">
                <div>
                  <p className="text-[11px] text-charcoal/50 font-medium">Kode undangan</p>
                  <p className="font-extrabold text-coffee-900 text-lg tracking-widest">{groupSession.code}</p>
                </div>
                <span className="text-[11px] text-coffee-600/70 font-medium">atau bagikan link:</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="flex items-center justify-center gap-2 py-3.5 rounded-xl border border-coffee-200 bg-white text-coffee-800 font-bold text-sm hover:bg-coffee-50 transition-colors active:scale-95"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Tersalin!' : 'Salin Link'}
                </button>
                <button
                  type="button"
                  onClick={handleShareInvite}
                  className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-coffee-700 text-cream font-bold text-sm hover:bg-coffee-800 transition-colors active:scale-95"
                >
                  <Share2 className="w-4 h-4" />
                  Bagikan
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── MEMBER SHEET ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {memberSheetOpen && groupSession && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMemberSheetOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-cream rounded-t-3xl shadow-soft-xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-w-lg mx-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-coffee-700/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-coffee-700" />
                  </div>
                  <h2 className="font-extrabold text-coffee-900 text-lg">Anggota Grup</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setMemberSheetOpen(false)}
                  className="w-8 h-8 rounded-lg hover:bg-coffee-50 flex items-center justify-center text-coffee-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {groupCart ? (
                <div className="space-y-2 mb-5 max-h-64 overflow-y-auto">
                  {groupCart.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between px-4 py-3 rounded-xl bg-white border border-coffee-100"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          member.id === groupSession.member_id
                            ? 'bg-coffee-700 text-cream'
                            : 'bg-coffee-100 text-coffee-800'
                        }`}>
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-coffee-900 text-sm">
                            {member.name}
                            {member.id === groupSession.member_id && (
                              <span className="ml-1.5 text-[10px] text-coffee-600/70 font-medium">(kamu)</span>
                            )}
                          </p>
                          <div className="flex items-center gap-1.5">
                            {member.is_host && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/70 rounded px-1.5 py-0.5">
                                <Crown className="w-2.5 h-2.5" /> Host
                              </span>
                            )}
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              member.is_ready
                                ? 'bg-green-50 text-green-700 border border-green-200/70'
                                : 'bg-coffee-50 text-coffee-600 border border-coffee-200/70'
                            }`}>
                              {member.is_ready ? '✓ Siap' : 'Pilih menu'}
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* Host can kick non-host members */}
                      {iAmHost && !member.is_host && (
                        <button
                          type="button"
                          onClick={() => handleKickMember(member.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-charcoal/30 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title={`Keluarkan ${member.name}`}
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 text-coffee-400 animate-spin" />
                </div>
              )}

              {/* Action buttons */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => { setMemberSheetOpen(false); setInviteSheetOpen(true); }}
                  className="w-full py-3 rounded-xl bg-coffee-50 border border-coffee-200 text-coffee-800 font-bold text-sm hover:bg-coffee-100 transition-colors active:scale-95 flex items-center justify-center gap-2"
                >
                  <Share2 className="w-4 h-4" />
                  Ajak Teman Lagi
                </button>
                {iAmHost ? (
                  <button
                    type="button"
                    onClick={() => { setMemberSheetOpen(false); handleCancelGroup(); }}
                    className="w-full py-3 rounded-xl border border-red-200 text-red-600 font-bold text-sm hover:bg-red-50 transition-colors active:scale-95 flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Batalkan Sesi
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setMemberSheetOpen(false); handleLeaveGroup(); }}
                    disabled={leavingGroup}
                    className="w-full py-3 rounded-xl border border-red-200 text-red-600 font-bold text-sm hover:bg-red-50 transition-colors active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {leavingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                    Keluar dari Grup
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
