import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { money } from '../lib/format';
import type { ListDetail, ListItem, ListKind, ProductCard } from '../lib/types';
import { toastError, toastSuccess } from '../ui/Toast';

/**
 * ListEditor — open a single list, manage its items.
 *
 * For shopping lists (the default), the line input doubles as a product
 * search box: results from /api/products/search appear inline as you type.
 * Tapping a result attaches the product card (image + price) to a new line.
 * If the upstream isn't configured the search box still works as a plain
 * text field — you just don't get pictures and prices.
 */
export function ListEditor({
  listId,
  onClose,
  onListChanged,
}: {
  listId: string;
  onClose: () => void;
  onListChanged?: () => void;
}) {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ['list', listId],
    queryFn: () => api.get<ListDetail>(`/api/lists/${listId}`),
    staleTime: 5_000,
  });
  const productStatus = useQuery({
    queryKey: ['products', 'status'],
    queryFn: () =>
      api.get<{ sources: { woolworths: { available: boolean } } }>(`/api/products/status`),
    staleTime: 60_000,
  });

  const list = detail.data?.list;
  const items = detail.data?.items ?? [];
  const isShopping = list?.kind === 'shopping' && (list?.store ?? null) === 'woolworths';
  const productsAvailable = !!productStatus.data?.sources?.woolworths?.available;

  const [title, setTitle] = useState('');
  useEffect(() => {
    if (list) setTitle(list.title);
  }, [list?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const renameMutation = useMutation({
    mutationFn: (newTitle: string) =>
      api.patch(`/api/lists/${listId}`, { title: newTitle }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lists'] });
      qc.invalidateQueries({ queryKey: ['list', listId] });
    },
  });
  const kindMutation = useMutation({
    mutationFn: (kind: ListKind) => api.patch(`/api/lists/${listId}`, { kind }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lists'] });
      qc.invalidateQueries({ queryKey: ['list', listId] });
    },
  });

  const addMutation = useMutation({
    mutationFn: (input: { text: string; product?: ProductCard | null; qty?: number }) =>
      api.post(`/api/lists/${listId}/items`, {
        text: input.text,
        qty: input.qty ?? 1,
        product: input.product ?? undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['list', listId] });
      qc.invalidateQueries({ queryKey: ['lists'] });
      onListChanged?.();
    },
    onError: () => toastError('Couldn’t add that line'),
  });
  const checkMutation = useMutation({
    mutationFn: (input: { itemId: string; checked: boolean }) =>
      api.post(`/api/lists/${listId}/items/${input.itemId}/check`, { checked: input.checked }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['list', listId] }),
  });
  const updateMutation = useMutation({
    mutationFn: (input: { itemId: string; patch: Partial<Pick<ListItem, 'text' | 'qty' | 'unitPriceCents'>> }) =>
      api.patch(`/api/lists/${listId}/items/${input.itemId}`, input.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['list', listId] }),
  });
  const removeMutation = useMutation({
    mutationFn: (itemId: string) => api.delete(`/api/lists/${listId}/items/${itemId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['list', listId] });
      qc.invalidateQueries({ queryKey: ['lists'] });
    },
  });
  const clearCheckedMutation = useMutation({
    mutationFn: () => api.post<{ removed: number }>(`/api/lists/${listId}/items/clear-checked`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['list', listId] });
      qc.invalidateQueries({ queryKey: ['lists'] });
      toastSuccess(`Cleared ${res.removed} done item${res.removed === 1 ? '' : 's'}`);
    },
  });

  const totalCents = useMemo(
    () =>
      items.reduce(
        (s, it) => s + (it.unitPriceCents != null ? it.unitPriceCents * Math.max(1, it.qty) : 0),
        0,
      ),
    [items],
  );
  const checkedCount = items.filter((i) => i.checkedAt).length;

  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState<{ loading: boolean; results: ProductCard[] } | null>(null);
  const searchTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!isShopping || !productsAvailable) {
      setSearch(null);
      return;
    }
    if (draft.trim().length < 2) {
      setSearch(null);
      return;
    }
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(async () => {
      setSearch({ loading: true, results: [] });
      try {
        const res = await api.get<{ products: ProductCard[] }>(
          `/api/products/search?q=${encodeURIComponent(draft.trim())}&pageSize=10`,
        );
        setSearch({ loading: false, results: res.products ?? [] });
      } catch {
        setSearch({ loading: false, results: [] });
      }
    }, 320);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [draft, isShopping, productsAvailable]);

  const submitFreeText = () => {
    const t = draft.trim();
    if (!t) return;
    addMutation.mutate({ text: t });
    setDraft('');
    setSearch(null);
  };

  if (detail.isLoading) {
    return <div className="grid h-full place-items-center text-ink-500">Loading list…</div>;
  }
  if (!list) {
    return (
      <div className="grid h-full place-items-center">
        <div className="card max-w-md p-6 text-center">
          <p className="font-semibold text-ink-900">List not found</p>
          <button onClick={onClose} className="btn-secondary mt-4">
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-900/15 bg-cream-100/70 px-3 py-2 sm:gap-3 sm:px-5">
        <button onClick={onClose} className="btn-ghost" aria-label="Back to calendar">
          ← Back
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title.trim() && title.trim() !== list.title) {
              renameMutation.mutate(title.trim());
            }
          }}
          className="input max-w-[260px] text-base font-semibold"
          aria-label="List title"
        />
        <select
          value={list.kind}
          onChange={(e) => kindMutation.mutate(e.target.value as ListKind)}
          className="input max-w-[160px]"
          aria-label="List kind"
        >
          <option value="shopping">Shopping</option>
          <option value="todo">Todo</option>
          <option value="packing">Packing</option>
          <option value="other">Other</option>
        </select>
        <span className="ml-auto text-sm text-ink-500">
          {checkedCount}/{items.length} done
          {totalCents > 0 && ` · ${money(totalCents)}`}
        </span>
        {checkedCount > 0 && (
          <button
            type="button"
            onClick={() => clearCheckedMutation.mutate()}
            className="btn-secondary"
          >
            Clear done
          </button>
        )}
      </div>

      <div className="border-b border-ink-900/10 bg-paper px-3 py-3 sm:px-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitFreeText();
          }}
          className="relative"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              isShopping && productsAvailable
                ? 'Add an item — try “milk” or “Tim Tams”…'
                : 'Add an item and press Enter…'
            }
            className="input pr-24 text-base"
            aria-label="Add item"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 btn-primary"
          >
            Add
          </button>
        </form>
        {search && (
          <ProductDropdown
            search={search}
            onPick={(card) => {
              addMutation.mutate({ text: card.name, product: card });
              setDraft('');
              setSearch(null);
            }}
          />
        )}
        {isShopping && !productsAvailable && (
          <p className="mt-2 text-xs text-ink-500">
            Live product prices are off (no Woolworths key configured). You can still add
            free-text items and prices.
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-5">
        {items.length === 0 ? (
          <div className="grid h-full place-items-center text-center text-ink-500">
            <div>
              <p className="font-semibold text-ink-900">Nothing on this list yet</p>
              <p className="mt-1 text-sm">Add the first item up top to get started.</p>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <ListItemRow
                key={item.id}
                item={item}
                onCheck={(checked) => checkMutation.mutate({ itemId: item.id, checked })}
                onUpdate={(patch) => updateMutation.mutate({ itemId: item.id, patch })}
                onRemove={() => removeMutation.mutate(item.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ProductDropdown({
  search,
  onPick,
}: {
  search: { loading: boolean; results: ProductCard[] };
  onPick: (p: ProductCard) => void;
}) {
  if (search.loading) {
    return (
      <div className="mt-2 rounded-xl border border-ink-900/10 bg-paper px-3 py-2 text-sm text-ink-500">
        Searching Woolworths…
      </div>
    );
  }
  if (search.results.length === 0) {
    return (
      <div className="mt-2 rounded-xl border border-ink-900/10 bg-paper px-3 py-2 text-sm text-ink-500">
        No products matched. Press Enter to add as a plain item.
      </div>
    );
  }
  return (
    <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-ink-900/15 bg-paper shadow-paper-sm">
      <ul className="divide-y divide-ink-900/10">
        {search.results.map((p) => (
          <li key={`${p.source}:${p.externalId}`}>
            <button
              type="button"
              onClick={() => onPick(p)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-cream-100"
            >
              <ProductImage product={p} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink-900">{p.name}</div>
                <div className="truncate text-xs text-ink-500">
                  {[p.brand, p.packageSize].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5 text-right">
                {p.priceCents != null ? (
                  <span className="font-display text-base font-extrabold tabular-nums text-money">
                    {money(p.priceCents)}
                  </span>
                ) : (
                  <span className="text-xs text-ink-400">no price</span>
                )}
                {p.onSpecial && p.wasPriceCents != null && (
                  <span className="text-[11px] text-accent-red line-through">
                    {money(p.wasPriceCents)}
                  </span>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ListItemRow({
  item,
  onCheck,
  onUpdate,
  onRemove,
}: {
  item: ListItem;
  onCheck: (checked: boolean) => void;
  onUpdate: (patch: Partial<Pick<ListItem, 'text' | 'qty' | 'unitPriceCents'>>) => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(item.text);
  useEffect(() => setText(item.text), [item.text]);

  const checked = !!item.checkedAt;
  const lineTotalCents =
    item.unitPriceCents != null ? item.unitPriceCents * Math.max(1, item.qty) : null;

  return (
    <li
      className={`flex items-stretch gap-3 rounded-xl border border-ink-900/15 bg-paper p-3 transition ${
        checked ? 'opacity-60' : ''
      }`}
    >
      <button
        type="button"
        aria-label={checked ? 'Mark as not done' : 'Mark as done'}
        onClick={() => onCheck(!checked)}
        className={`grid h-7 w-7 flex-shrink-0 place-items-center self-center rounded-md border-2 transition ${
          checked
            ? 'border-money bg-money text-white'
            : 'border-ink-900/40 bg-cream-50 hover:border-ink-900'
        }`}
      >
        {checked && <span aria-hidden>✓</span>}
      </button>
      {item.productJson && <ProductImage product={item.productJson} size={48} />}
      <div className="min-w-0 flex-1">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (text.trim() && text.trim() !== item.text) onUpdate({ text: text.trim() });
          }}
          className={`w-full bg-transparent text-sm font-semibold text-ink-900 outline-none focus:ring-2 focus:ring-accent-blue/50 ${
            checked ? 'line-through' : ''
          }`}
        />
        {item.productJson && (
          <div className="truncate text-xs text-ink-500">
            {[item.productJson.brand, item.productJson.packageSize].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end justify-between gap-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Decrease quantity"
            className="btn-icon"
            onClick={() => onUpdate({ qty: Math.max(1, item.qty - 1) })}
          >
            −
          </button>
          <span className="min-w-[20px] text-center text-sm font-bold tabular-nums">
            {item.qty}
          </span>
          <button
            type="button"
            aria-label="Increase quantity"
            className="btn-icon"
            onClick={() => onUpdate({ qty: item.qty + 1 })}
          >
            +
          </button>
        </div>
        <div className="text-right">
          {lineTotalCents != null ? (
            <span className="font-display text-base font-extrabold tabular-nums text-money">
              {money(lineTotalCents)}
            </span>
          ) : (
            <PriceInput
              valueCents={item.unitPriceCents}
              onCommit={(cents) => onUpdate({ unitPriceCents: cents })}
            />
          )}
          {item.productJson?.onSpecial && item.productJson.wasPriceCents != null && (
            <div className="text-[11px] text-accent-red line-through">
              {money(item.productJson.wasPriceCents * Math.max(1, item.qty))}
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        aria-label="Remove item"
        onClick={onRemove}
        className="self-center text-ink-400 transition hover:text-accent-red"
      >
        ×
      </button>
    </li>
  );
}

function PriceInput({
  valueCents,
  onCommit,
}: {
  valueCents: number | null;
  onCommit: (cents: number | null) => void;
}) {
  const [v, setV] = useState(valueCents != null ? (valueCents / 100).toFixed(2) : '');
  useEffect(() => {
    setV(valueCents != null ? (valueCents / 100).toFixed(2) : '');
  }, [valueCents]);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const trimmed = v.trim();
        if (!trimmed) {
          if (valueCents != null) onCommit(null);
          return;
        }
        const n = Number(trimmed.replace(/[^\d.]/g, ''));
        if (!Number.isFinite(n)) return;
        onCommit(Math.round(n * 100));
      }}
      placeholder="$"
      inputMode="decimal"
      className="w-20 rounded-md border border-ink-900/15 bg-cream-50 px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
      aria-label="Price"
    />
  );
}

function ProductImage({ product, size }: { product: ProductCard; size: number }) {
  if (!product.image) {
    return (
      <div
        className="grid flex-shrink-0 place-items-center self-center rounded-lg bg-cream-200 ring-1 ring-ink-900/15"
        style={{ width: size, height: size }}
        aria-hidden
      >
        🛒
      </div>
    );
  }
  return (
    <img
      src={product.image}
      alt=""
      loading="lazy"
      className="flex-shrink-0 self-center rounded-lg object-contain ring-1 ring-ink-900/15"
      style={{ width: size, height: size, background: '#fff' }}
    />
  );
}
