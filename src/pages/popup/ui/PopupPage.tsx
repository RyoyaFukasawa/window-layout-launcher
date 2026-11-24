import { useMemo, useRef, useState } from "react";
import { ChevronRight, Laptop, LayoutGrid, Monitor, Pencil, Save, Search, Settings, Star } from "lucide-react";
import { layoutFor, type LayoutSet, newSet, SetAvatar, setStats, useAppState } from "@/entities/layout-set";
import { GROUP_COLORS, type Mode, useDisplays } from "@/entities/window";
import { captureWindows } from "@/features/capture-windows";
import type { Message } from "@/features/open-set";
import { useSystemDark } from "@/shared/lib/hooks";
import { fallbackTitle } from "@/shared/lib/url";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Favicon } from "@/shared/ui/favicon";
import { Input } from "@/shared/ui/input";

const MODE_LABEL: Record<Mode, string> = { docked: "ドック時", laptop: "ノートPCのみ" };

const defaultName = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())} のウィンドウ`;
};

export function PopupPage() {
  useSystemDark();
  const { state, saveNow } = useAppState();
  const displays = useDisplays();
  const mode: Mode = displays.length >= 2 ? "docked" : "laptop";
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    const sets = state?.sets ?? [];
    const k = q.trim().toLowerCase();
    if (!k) return sets;
    // セット名に加えて、中のタブのタイトル・URL でも絞り込む
    return sets.filter((s) => s.name.toLowerCase().includes(k)
      || layoutFor(s, mode).some((w) => w.tabs.some((t) => `${t.title ?? ""} ${t.url}`.toLowerCase().includes(k))
        || (w.groups ?? []).some((g) => g.title.toLowerCase().includes(k))));
  }, [state, q, mode]);

  const open = async (set: LayoutSet) => {
    const msg: Message = { type: "open-set", setId: set.id, mode };
    await chrome.runtime.sendMessage(msg).catch(() => undefined);
    window.close();
  };
  const edit = (set?: LayoutSet) => {
    void chrome.tabs.create({ url: chrome.runtime.getURL(`options.html${set ? `#set=${set.id}` : ""}`) });
    window.close();
  };

  const saveCurrent = async () => {
    if (!state || saving === null) return;
    const wins = await captureWindows(displays, mode);
    const set = newSet(saving.trim() || defaultName());
    set.layouts[mode] = wins;
    const next = structuredClone(state);
    next.sets.unshift(set);
    await saveNow(next);
    setSaving(null);
    setQ("");
    setCursor(0);
    setSavedId(set.id);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter" && list[cursor]) { e.preventDefault(); void open(list[cursor]); }
  };

  if (!state || !displays.length) return <div className="grid h-40 w-[380px] place-items-center text-sm text-muted-foreground">読み込み中…</div>;

  return (
    <div className="flex max-h-[580px] w-[380px] flex-col bg-background text-foreground">
      <header className="flex items-center gap-2.5 border-b px-4 py-3">
        <div className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
          <LayoutGrid className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-sm font-semibold">レイアウトセット</div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {mode === "docked" ? <Monitor className="size-3" /> : <Laptop className="size-3" />}
            ディスプレイ{displays.length}枚 ・「{MODE_LABEL[mode]}」で開きます
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => edit()} aria-label="設定を開く" title="設定を開く">
          <Settings />
        </Button>
      </header>

      <div className="relative px-3 pt-3">
        <Search className="pointer-events-none absolute left-5.5 top-1/2 mt-1.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          autoFocus
          value={q}
          placeholder="セット名・タブ・グループで検索"
          className="h-8 pl-8"
          onChange={(e) => { setQ(e.target.value); setCursor(0); }}
          onKeyDown={onKey}
        />
      </div>

      <ul className="flex-1 overflow-y-auto p-2" role="listbox" aria-label="レイアウトセット">
        {list.map((set, i) => {
          const st = setStats(set, mode);
          const startup = state.startupSetId === set.id;
          return (
            <li key={set.id} role="option" aria-selected={i === cursor}>
              <div
                className={cn(
                  "group flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                  i === cursor ? "bg-muted" : "hover:bg-muted/60",
                  savedId === set.id && "ring-2 ring-emerald-500/50",
                )}
                onMouseEnter={() => setCursor(i)}
                onClick={() => void open(set)}
              >
                <SetAvatar id={set.id} name={set.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{set.name}</span>
                    {startup && <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" aria-label="起動時に開く" />}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    ウィンドウ {st.windows} ・ タブ {st.tabs}
                    {!set.layouts[mode].length && st.windows > 0 && `（${MODE_LABEL[mode === "docked" ? "laptop" : "docked"]}のレイアウト）`}
                  </div>
                  <div className="mt-1 flex items-center gap-1" title={st.sample.map((t) => t.title || fallbackTitle(t.url)).join("\n")}>
                    {st.sample.map((t) => <Favicon key={t.id} url={t.url} className="size-3.5" />)}
                    {st.tabs > st.sample.length && <span className="text-[10px] text-muted-foreground">+{st.tabs - st.sample.length}</span>}
                  </div>
                  {(() => {
                    const gs = layoutFor(set, mode).flatMap((w) => w.groups ?? []);
                    return gs.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {gs.slice(0, 4).map((g) => (
                          <span key={g.id} className="max-w-28 truncate rounded px-1.5 text-[10px] font-medium leading-4 text-white" style={{ background: GROUP_COLORS[g.color].hex }}>
                            {g.title || "グループ"}
                          </span>
                        ))}
                        {gs.length > 4 && <span className="text-[10px] text-muted-foreground">+{gs.length - 4}</span>}
                      </div>
                    );
                  })()}
                </div>
                <button
                  className="rounded p-1 text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); edit(set); }}
                  aria-label="このセットを編集"
                  title="このセットを編集"
                >
                  <Pencil className="size-3.5" />
                </button>
                <ChevronRight className={cn("size-4 text-muted-foreground transition-opacity", i === cursor ? "opacity-100" : "opacity-0")} />
              </div>
            </li>
          );
        })}
        {!list.length && (
          <li className="px-3 py-8 text-center text-sm text-muted-foreground">
            {q ? "一致するセットがありません" : "セットがありません"}
          </li>
        )}
      </ul>

      <footer className="border-t p-3">
        {saving === null ? (
          <Button variant="outline" className="w-full" onClick={() => setSaving(defaultName())}>
            <Save /> 今のウィンドウを新しいセットとして保存
          </Button>
        ) : (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void saveCurrent(); }}>
            <Input
              autoFocus
              value={saving}
              onChange={(e) => setSaving(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setSaving(null); searchRef.current?.focus(); } }}
              placeholder="セットの名前"
              className="h-8"
            />
            <Button type="submit" size="sm" className="h-8">保存</Button>
          </form>
        )}
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          ↑↓ で選んで Enter で開く ・ <Star className="inline size-2.5 fill-amber-400 text-amber-400" /> はChrome起動時に開くセット
        </p>
      </footer>
    </div>
  );
}
