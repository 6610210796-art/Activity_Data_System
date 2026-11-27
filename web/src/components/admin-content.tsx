"use client";

import Image from "next/image";
import {
  AlertCircle, ArrowUpRight, Bell, Check, ChevronDown, ChevronLeft, ChevronRight,
  ChevronUp, FileText, History, House, Image as ImageIcon, LayoutDashboard, Pencil,
  Plus, RotateCcw, Search, Settings2, Shield, Trash2, X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { SiteContent } from "@/lib/content";
import { getContentGroupLabel } from "@/lib/content-catalog";
import { validateContentValue } from "@/lib/admin-content-policy";
import type { AdminContentEntry, ContentHistoryFilters, ContentHistoryResult } from "@/lib/admin-content";
import type { AnnouncementListResult, AnnouncementView } from "@/lib/admin-announcements";
import type { OptionsSnapshot } from "@/lib/admin-options";
import type { SiteAssetView } from "@/lib/site-assets";
import {
  formatAnnouncementPeriod,
  formatThaiShortDate,
  validateAnnouncementInput,
  type AnnouncementFilters,
  type AnnouncementInput,
  type AnnouncementStatus,
} from "@/lib/announcement-policy";
import {
  OPTION_DEFINITIONS,
  OPTION_GROUPS,
  validateOptionDraft,
  type OptionDraft,
  type OptionGroup,
} from "@/lib/option-policy";

type Tab = "text" | "assets" | "announcements" | "options" | "history";
type HistoryItem = ContentHistoryResult["items"][number];

interface AnnouncementFormState {
  id: number | null;
  title: string;
  body: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

interface AnnouncementConfirmState {
  kind: "delete" | "toggle";
  item: AnnouncementView;
}

interface EditableOption extends OptionDraft {
  usageCount: number;
  localId: string;
}

type EditableOptions = Record<OptionGroup, { version: string; items: EditableOption[] }>;

interface OptionAddForm {
  group: OptionGroup;
  code: string;
  nameTh: string;
}

interface Props {
  announcements: AnnouncementListResult | null;
  content: SiteContent;
  entries: AdminContentEntry[];
  history: ContentHistoryResult | null;
  initialTab: Tab;
  initialFilters: ContentHistoryFilters;
  logo: SiteAssetView;
  options: OptionsSnapshot | null;
}

const EMPTY_ANNOUNCEMENTS: AnnouncementListResult = { items: [], total: 0, page: 1, pageSize: 20 };
const EMPTY_EDITABLE_OPTIONS: EditableOptions = {
  departments: { version: "", items: [] },
  activity_types: { version: "", items: [] },
  participant_types: { version: "", items: [] },
};

function snapshotToEditable(snapshot: OptionsSnapshot): EditableOptions {
  const result = { ...EMPTY_EDITABLE_OPTIONS };
  for (const group of OPTION_GROUPS) {
    const view = snapshot.groups.find((item) => item.group === group);
    result[group] = {
      version: view?.version ?? "",
      items: (view?.items ?? []).map((item, index) => ({
        localId: `${group}-${item.key || `new-${index}`}`,
        key: item.key,
        code: item.key,
        nameTh: item.nameTh,
        description: item.description,
        example: item.example,
        isActive: item.isActive,
        usageCount: item.usageCount,
      })),
    };
  }
  return result;
}

function editableToPayload(data: EditableOptions) {
  const payload = {} as Record<OptionGroup, { version: string; items: OptionDraft[] }>;
  for (const group of OPTION_GROUPS) {
    payload[group] = {
      version: data[group].version,
      items: data[group].items.map((item) => ({
        key: item.key,
        code: item.code,
        nameTh: item.nameTh,
        description: item.description,
        example: item.example,
        isActive: item.isActive,
      })),
    };
  }
  return payload;
}

function optionsAreEqual(left: EditableOptions, right: EditableOptions): boolean {
  return OPTION_GROUPS.every((group) => {
    const a = left[group];
    const b = right[group];
    return a.version === b.version
      && a.items.length === b.items.length
      && a.items.every((item, index) => {
        const other = b.items[index];
        return other
          && item.key === other.key
          && item.code === other.code
          && item.nameTh === other.nameTh
          && item.description === other.description
          && item.example === other.example
          && item.isActive === other.isActive;
      });
  });
}

const TABS: { id: Tab; key: keyof SiteContent; icon: typeof FileText }[] = [
  { id: "text", key: "content.tab.text", icon: FileText },
  { id: "assets", key: "content.tab.assets", icon: ImageIcon },
  { id: "announcements", key: "content.tab.announcements", icon: Bell },
  { id: "options", key: "content.tab.options", icon: Settings2 },
  { id: "history", key: "content.tab.history", icon: History },
];

const GROUP_ICONS: Record<string, typeof House> = {
  app: Shield,
  login: Shield,
  home: House,
  dashboard: LayoutDashboard,
  error: AlertCircle,
};

const VALIDATION_KEYS: Record<string, keyof SiteContent> = {
  required: "content.validation.required",
  markup: "content.validation.markup",
  length: "content.validation.length",
  control: "content.validation.control",
  placeholder: "content.validation.placeholder",
  conflict: "content.error.conflict",
};

const STATUS_KEYS: Record<AnnouncementStatus, keyof SiteContent> = {
  active: "content.announcements.status.active",
  upcoming: "content.announcements.status.upcoming",
  expired: "content.announcements.status.expired",
  inactive: "content.announcements.status.inactive",
};

const ANNOUNCEMENT_ERROR_KEYS: Record<string, keyof SiteContent> = {
  required: "content.announcements.error.required",
  markup: "content.announcements.error.markup",
  control: "content.announcements.error.control",
  title_length: "content.announcements.error.title_length",
  body_length: "content.announcements.error.body_length",
  date: "content.announcements.error.date",
  order: "content.announcements.error.order",
};

const LOGO_ERROR_KEYS: Record<string, keyof SiteContent> = {
  svg: "content.assets.logo.error.svg",
  type: "content.assets.logo.error.type",
  size: "content.assets.logo.error.size",
  dimension: "content.assets.logo.error.dimension",
  invalid: "content.assets.logo.error.invalid",
  alt_length: "content.assets.logo.error.alt_length",
  rate_limit: "content.error.server",
  server: "content.assets.logo.error.server",
};

const OPTION_GROUP_KEYS: Record<OptionGroup, keyof SiteContent> = {
  departments: "content.options.group.departments",
  activity_types: "content.options.group.activity_types",
  participant_types: "content.options.group.participant_types",
};

const OPTION_ERROR_KEYS: Record<string, keyof SiteContent> = {
  group: "content.options.error.group",
  required: "content.options.error.required",
  key: "content.options.error.key",
  key_length: "content.options.error.key_length",
  name_length: "content.options.error.name_length",
  text_length: "content.options.error.text_length",
  markup: "content.options.error.markup",
  control: "content.options.error.control",
  sort: "content.options.error.sort",
  duplicate: "content.options.error.duplicate",
  not_found: "content.options.error.not_found",
  last_active: "content.options.error.last_active",
  incomplete: "content.options.error.incomplete",
  unknown: "content.options.error.unknown",
  overflow: "content.options.error.overflow",
  code: "content.options.error.code",
  code_length: "content.options.error.code_length",
  conflict: "content.options.error.conflict",
  invalid: "content.options.error.invalid",
  server: "content.options.error.server",
};

function isTab(value: string | null): value is Tab {
  return value === "text" || value === "assets" || value === "announcements" || value === "options" || value === "history";
}

function isLongText(value: string): boolean {
  return value.includes("\n") || [...value].length > 150;
}

function formatThaiDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok",
  }).format(date);
}

function formatTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}

function historyUrl(filters: ContentHistoryFilters): string {
  const params = new URLSearchParams({ tab: "history" });
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.editor) params.set("editor", filters.editor);
  if (filters.group) params.set("group", filters.group);
  if (filters.q) params.set("q", filters.q);
  if (filters.page > 1) params.set("page", String(filters.page));
  return `/admin/content?${params.toString()}`;
}

function readFilters(url: URL, fallback: ContentHistoryFilters): ContentHistoryFilters {
  const page = Number(url.searchParams.get("page") ?? 1);
  return {
    from: url.searchParams.get("from") ?? "",
    to: url.searchParams.get("to") ?? "",
    editor: url.searchParams.get("editor") ?? "",
    group: url.searchParams.get("group") ?? "",
    q: url.searchParams.get("q") ?? "",
    page: Number.isSafeInteger(page) && page > 0 ? page : fallback.page,
  };
}

export function AdminContent({
  announcements: initialAnnouncements, content, entries: initialEntries,
  history: initialHistory, initialTab, initialFilters, logo: initialLogo,
  options: initialOptions,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [entries, setEntries] = useState(initialEntries);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [serverLatest, setServerLatest] = useState<Record<string, string>>({});
  const [selectedGroup, setSelectedGroup] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveConfirmation, setSaveConfirmation] = useState(false);
  const [pageError, setPageError] = useState("");
  const [success, setSuccess] = useState("");
  const [historyFilters, setHistoryFilters] = useState(initialFilters);
  const [historyData, setHistoryData] = useState<ContentHistoryResult | null>(initialHistory);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const [restoreTarget, setRestoreTarget] = useState<HistoryItem | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState("");
  const [logoView, setLogoView] = useState(initialLogo);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoAlt, setLogoAlt] = useState(initialLogo.alt);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [logoResetConfirm, setLogoResetConfirm] = useState(false);
  const logoFormRef = useRef<HTMLFormElement>(null);
  const [announcementData, setAnnouncementData] = useState(initialAnnouncements ?? EMPTY_ANNOUNCEMENTS);
  const [announcementFilters, setAnnouncementFilters] = useState<AnnouncementFilters>({ q: "", status: "all", page: 1 });
  const [announcementLoading, setAnnouncementLoading] = useState(false);
  const [announcementError, setAnnouncementError] = useState("");
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementFormState | null>(null);
  const [announcementConfirm, setAnnouncementConfirm] = useState<AnnouncementConfirmState | null>(null);
  const initialEditableOptions = useMemo(
    () => initialOptions ? snapshotToEditable(initialOptions) : EMPTY_EDITABLE_OPTIONS,
    [initialOptions],
  );
  const [optionData, setOptionData] = useState<EditableOptions>(initialEditableOptions);
  const [optionBaseline, setOptionBaseline] = useState<EditableOptions>(initialEditableOptions);
  const [optionLoading, setOptionLoading] = useState(!initialOptions);
  const [optionError, setOptionError] = useState("");
  const [optionBusy, setOptionBusy] = useState(false);
  const [optionCollapsed, setOptionCollapsed] = useState<Record<OptionGroup, boolean>>({
    departments: false, activity_types: false, participant_types: false,
  });
  const [editingOption, setEditingOption] = useState<Record<OptionGroup, string | null>>({
    departments: null, activity_types: null, participant_types: null,
  });
  const [expandedOptionDetail, setExpandedOptionDetail] = useState<Record<string, boolean>>({});
  const [optionAddForm, setOptionAddForm] = useState<OptionAddForm | null>(null);
  const [optionConfirm, setOptionConfirm] = useState(false);
  const optionsDirty = useMemo(() => !optionsAreEqual(optionBaseline, optionData), [optionBaseline, optionData]);
  const dirty = useMemo(() => entries.filter((entry) => Object.hasOwn(drafts, entry.key) && drafts[entry.key] !== entry.value), [drafts, entries]);
  const dirtyRef = useRef(false);
  const firstHistoryLoad = useRef(true);
  const firstAnnouncementLoad = useRef(true);
  const firstOptionLoad = useRef(true);

  const groups = useMemo(() => [...new Set(entries.map((entry) => entry.pageGroup))].sort((a, b) => a.localeCompare(b)), [entries]);
  const visibleEntries = useMemo(() => entries.filter((entry) => {
    if (selectedGroup && entry.pageGroup !== selectedGroup) return false;
    const query = search.trim().toLocaleLowerCase();
    return !query || `${entry.label} ${entry.key} ${drafts[entry.key] ?? entry.value}`.toLocaleLowerCase().includes(query);
  }), [drafts, entries, search, selectedGroup]);

  useEffect(() => {
    dirtyRef.current = dirty.length > 0 || optionsDirty;
  }, [dirty.length, optionsDirty]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const guardNavigation = (event: MouseEvent) => {
      if (!dirtyRef.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") return;
      const targetUrl = new URL(anchor.href, window.location.href);
      if (targetUrl.pathname === pathname || targetUrl.origin !== window.location.origin) return;
      if (!window.confirm(content["content.action.discard"] + "?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const guardSubmit = (event: SubmitEvent) => {
      if (!dirtyRef.current) return;
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const action = new URL(form.action || window.location.href, window.location.href);
      if (action.pathname !== pathname && !window.confirm(content["content.action.discard"] + "?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onPopState = () => {
      const url = new URL(window.location.href);
      const nextTab = url.pathname === pathname && isTab(url.searchParams.get("tab")) ? url.searchParams.get("tab") as Tab : "text";
      if (url.pathname !== pathname && dirtyRef.current && !window.confirm(content["content.action.discard"] + "?")) {
        window.history.pushState(window.history.state, "", pathname + window.location.search);
        return;
      }
      setActiveTab(nextTab);
      if (nextTab === "history") setHistoryFilters(readFilters(url, initialFilters));
    };
    document.addEventListener("click", guardNavigation, true);
    document.addEventListener("submit", guardSubmit, true);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", guardNavigation, true);
      document.removeEventListener("submit", guardSubmit, true);
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", onPopState);
    };
  }, [content, initialFilters, pathname]);

  useEffect(() => {
    if (activeTab !== "history") return;
    if (firstHistoryLoad.current && initialHistory) {
      firstHistoryLoad.current = false;
      return;
    }
    const controller = new AbortController();
    setHistoryLoading(true);
    setHistoryError(false);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ view: "history", page: String(historyFilters.page) });
      for (const key of ["from", "to", "editor", "group", "q"] as const) {
        if (historyFilters[key]) params.set(key, historyFilters[key]);
      }
      fetch(`/api/admin/content?${params.toString()}`, { signal: controller.signal, cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("history");
          return response.json() as Promise<ContentHistoryResult>;
        })
        .then(setHistoryData)
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) setHistoryError(true);
        })
        .finally(() => setHistoryLoading(false));
    }, historyFilters.q === (initialHistory ? initialFilters.q : "") ? 0 : 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeTab, historyFilters, initialFilters, initialHistory]);

  async function loadAnnouncements(filters: AnnouncementFilters, signal?: AbortSignal) {
    const params = new URLSearchParams({ page: String(filters.page) });
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.status !== "all") params.set("status", filters.status);
    const response = await fetch(`/api/admin/announcements?${params.toString()}`, {
      cache: "no-store",
      signal,
    });
    if (!response.ok) throw new Error("announcements");
    setAnnouncementData(await response.json() as AnnouncementListResult);
  }

  useEffect(() => {
    if (activeTab !== "announcements") return;
    if (firstAnnouncementLoad.current) {
      firstAnnouncementLoad.current = false;
      return;
    }
    const controller = new AbortController();
    setAnnouncementLoading(true);
    setAnnouncementError("");
    const timer = window.setTimeout(() => {
      void loadAnnouncements(announcementFilters, controller.signal)
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setAnnouncementError(content["content.announcements.error"]);
          }
        })
        .finally(() => setAnnouncementLoading(false));
    }, announcementFilters.q ? 350 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeTab, announcementFilters, content]);

  function changeAnnouncementFilter<K extends keyof AnnouncementFilters>(
    key: K,
    value: AnnouncementFilters[K],
  ) {
    setAnnouncementFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "page" ? {} : { page: 1 }),
    }));
  }

  function announcementErrorFor(input: AnnouncementInput): string {
    const result = validateAnnouncementInput(input);
    if (result.ok) return "";
    return content[ANNOUNCEMENT_ERROR_KEYS[result.error] ?? "content.announcements.error.server"];
  }

  function openAnnouncementForm(item?: AnnouncementView) {
    setAnnouncementForm({
      id: item?.id ?? null,
      title: item?.title ?? "",
      body: item?.body ?? "",
      startDate: item?.startDate ?? "",
      endDate: item?.endDate ?? "",
      isActive: item?.isActive ?? true,
    });
    setAnnouncementError("");
  }

  async function saveAnnouncement() {
    if (!announcementForm) return;
    const input: AnnouncementInput = {
      title: announcementForm.title,
      body: announcementForm.body,
      startDate: announcementForm.startDate,
      endDate: announcementForm.endDate,
      isActive: announcementForm.isActive,
    };
    const validationMessage = announcementErrorFor(input);
    if (validationMessage) {
      setAnnouncementError(validationMessage);
      return;
    }
    setAnnouncementLoading(true);
    setAnnouncementError("");
    const id = announcementForm.id;
    try {
      const response = await fetch(id ? `/api/admin/announcements/${id}` : "/api/admin/announcements", {
        method: id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, endDate: announcementForm.endDate }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "server");
      await loadAnnouncements(announcementFilters);
      setAnnouncementForm(null);
      setSuccess(content[id ? "content.announcements.success.update" : "content.announcements.success.create"]);
      router.refresh();
    } catch {
      setAnnouncementError(content["content.announcements.error.server"]);
    } finally {
      setAnnouncementLoading(false);
    }
  }

  async function applyAnnouncementConfirm() {
    if (!announcementConfirm) return;
    const { item, kind } = announcementConfirm;
    setAnnouncementLoading(true);
    setAnnouncementError("");
    try {
      const response = await fetch(
        kind === "delete" ? `/api/admin/announcements/${item.id}` : `/api/admin/announcements/${item.id}/toggle`,
        { method: kind === "delete" ? "DELETE" : "POST" },
      );
      if (!response.ok) throw new Error("announcement");
      await loadAnnouncements(announcementFilters);
      setAnnouncementConfirm(null);
      setSuccess(content[kind === "delete" ? "content.announcements.success.delete" : "content.announcements.success.toggle"]);
      router.refresh();
    } catch {
      setAnnouncementError(content["content.announcements.error.server"]);
    } finally {
      setAnnouncementLoading(false);
    }
  }

  async function loadOptions(signal?: AbortSignal) {
    const response = await fetch("/api/admin/options", { cache: "no-store", signal });
    if (!response.ok) throw new Error("options");
    const snapshot = await response.json() as OptionsSnapshot;
    const editable = snapshotToEditable(snapshot);
    setOptionData(editable);
    setOptionBaseline(editable);
  }

  useEffect(() => {
    if (activeTab !== "options" || !firstOptionLoad.current) return;
    firstOptionLoad.current = false;
    if (initialOptions) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadOptions(controller.signal)
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setOptionError(content["content.options.error"]);
          }
        })
        .finally(() => setOptionLoading(false));
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeTab, content, initialOptions]);

  function optionErrorFor(group: OptionGroup, input: OptionDraft): string {
    const result = validateOptionDraft(group, input);
    if (result.ok) return "";
    return content[OPTION_ERROR_KEYS[result.error] ?? "content.options.error.server"];
  }

  function updateOption(group: OptionGroup, localId: string, patch: Partial<EditableOption>) {
    setOptionData((current) => ({
      ...current,
      [group]: {
        ...current[group],
        items: current[group].items.map((item) => item.localId === localId ? { ...item, ...patch } : item),
      },
    }));
  }

  function moveOption(group: OptionGroup, from: number, to: number) {
    setOptionData((current) => {
      const items = [...current[group].items];
      if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return current;
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      return { ...current, [group]: { ...current[group], items } };
    });
  }

  function toggleOptionCollapse(group: OptionGroup) {
    setOptionCollapsed((current) => ({ ...current, [group]: !current[group] }));
  }

  function toggleOptionDetail(localId: string) {
    setExpandedOptionDetail((current) => ({ ...current, [localId]: !current[localId] }));
  }

  function submitOptionAdd() {
    if (!optionAddForm) return;
    const input: OptionDraft = {
      key: "",
      code: optionAddForm.group === "departments" ? optionAddForm.code : "",
      nameTh: optionAddForm.nameTh,
      description: "",
      example: "",
      isActive: true,
    };
    const message = optionErrorFor(optionAddForm.group, input);
    if (message) {
      setOptionError(message);
      return;
    }
    const group = optionAddForm.group;
    const localId = `${group}-new-${Date.now()}`;
    setOptionData((current) => ({
      ...current,
      [group]: {
        ...current[group],
        items: [...current[group].items, {
          ...input,
          code: group === "departments" ? input.code.toUpperCase() : "",
          usageCount: 0,
          localId,
        }],
      },
    }));
    setEditingOption((current) => ({ ...current, [group]: localId }));
    setOptionAddForm(null);
    setOptionError("");
  }

  function discardOptionChanges() {
    setOptionData(optionBaseline);
    setEditingOption({ departments: null, activity_types: null, participant_types: null });
    setOptionConfirm(false);
    setOptionError("");
  }

  function optionChangeSummaries(): string[] {
    const summaries: string[] = [];
    for (const group of OPTION_GROUPS) {
      const beforeItems = optionBaseline[group].items;
      const afterItems = optionData[group].items;
      for (const [index, item] of afterItems.entries()) {
        const before = beforeItems.find((candidate) => candidate.key && candidate.key === item.key);
        if (!before) {
          summaries.push(formatTemplate(content["content.options.confirm.added"], { name: item.nameTh }));
          continue;
        }
        if (before.nameTh !== item.nameTh) {
          summaries.push(formatTemplate(content["content.options.confirm.change"], {
            key: item.key, before: before.nameTh, after: item.nameTh,
          }));
        }
        if (before.isActive !== item.isActive) {
          summaries.push(formatTemplate(content["content.options.confirm.status"], {
            name: item.nameTh,
            before: content[before.isActive ? "content.options.status.active" : "content.options.status.inactive"],
            after: content[item.isActive ? "content.options.status.active" : "content.options.status.inactive"],
          }));
        }
        if (beforeItems.indexOf(before) !== index) {
          summaries.push(formatTemplate(content["content.options.confirm.order"], {
            name: item.nameTh,
            before: String(beforeItems.indexOf(before) + 1),
            after: String(index + 1),
          }));
        }
      }
    }
    return summaries;
  }

  async function saveAllOptions() {
    if (!optionsDirty) return;
    setOptionBusy(true);
    setOptionError("");
    try {
      const response = await fetch("/api/admin/options/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editableToPayload(optionData)),
      });
      const result = await response.json() as { error?: string; snapshot?: OptionsSnapshot };
      if (!response.ok || !result.snapshot) {
        setOptionError(content[OPTION_ERROR_KEYS[result.error ?? "server"] ?? "content.options.error.server"]);
        return;
      }
      const saved = snapshotToEditable(result.snapshot);
      setOptionData(saved);
      setOptionBaseline(saved);
      setOptionConfirm(false);
      setEditingOption({ departments: null, activity_types: null, participant_types: null });
      setSuccess(content["content.options.success.saved"]);
      router.refresh();
    } catch {
      setOptionError(content["content.options.error.server"]);
    } finally {
      setOptionBusy(false);
    }
  }

  async function uploadLogo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!logoFile) {
      setLogoError(content["content.validation.required"]);
      return;
    }
    if (/\.svg$/i.test(logoFile.name)) {
      setLogoError(content["content.assets.logo.error.svg"]);
      return;
    }
    setLogoBusy(true);
    setLogoError("");
    const body = new FormData();
    body.set("file", logoFile);
    body.set("altText", logoAlt);
    try {
      const response = await fetch("/api/admin/content/logo", { method: "POST", body });
      const result = await response.json() as {
        error?: string;
        logo?: SiteAssetView;
        warning?: boolean;
      };
      if (!response.ok || !result.logo) {
        throw new Error(result.error ?? "server");
      }
      setLogoView(result.logo);
      setLogoAlt(result.logo.alt);
      setLogoFile(null);
      logoFormRef.current?.reset();
      setSuccess(content[result.warning ? "content.assets.logo.warning" : "content.assets.logo.updated"]);
      router.refresh();
    } catch (error) {
      const code = error instanceof Error ? error.message : "server";
      setLogoError(content[LOGO_ERROR_KEYS[code] ?? "content.assets.logo.error.server"]);
    } finally {
      setLogoBusy(false);
    }
  }

  async function resetLogo() {
    setLogoBusy(true);
    setLogoError("");
    try {
      const response = await fetch("/api/admin/content/logo", { method: "DELETE" });
      const result = await response.json() as { logo?: SiteAssetView; warning?: boolean; error?: string };
      if (!response.ok || !result.logo) throw new Error(result.error ?? "server");
      setLogoView(result.logo);
      setLogoAlt(result.logo.alt);
      setLogoFile(null);
      logoFormRef.current?.reset();
      setLogoResetConfirm(false);
      setSuccess(content[result.warning ? "content.assets.logo.warning" : "content.assets.logo.reset_success"]);
      router.refresh();
    } catch {
      setLogoError(content["content.assets.logo.error.server"]);
    } finally {
      setLogoBusy(false);
    }
  }

  function changeTab(tab: Tab) {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    if (tab !== "history") {
      for (const key of ["from", "to", "editor", "group", "q", "page"]) url.searchParams.delete(key);
    }
    window.history.pushState(window.history.state, "", url.pathname + url.search);
    if (tab === "history") setHistoryFilters(readFilters(url, initialFilters));
  }

  function changeHistoryFilter<K extends keyof ContentHistoryFilters>(key: K, value: ContentHistoryFilters[K]) {
    const next = { ...historyFilters, [key]: value, ...(key === "page" ? {} : { page: 1 }) };
    setHistoryFilters(next);
    window.history.replaceState(window.history.state, "", historyUrl(next));
  }

  function draftValue(entry: AdminContentEntry): string {
    return Object.hasOwn(drafts, entry.key) ? drafts[entry.key] : entry.value;
  }

  function validationError(entry: AdminContentEntry, value: string): string {
    const result = validateContentValue(value, entry.fallback);
    if (!result.error) return "";
    const message = content[VALIDATION_KEYS[result.error]];
    if (result.error !== "placeholder") return message;
    const placeholders = result.placeholders.map((name) => `{${name}}`).join(", ");
    return message.replace("{placeholders}", placeholders);
  }

  function updateDraft(entry: AdminContentEntry, value: string) {
    setDrafts((current) => ({ ...current, [entry.key]: value }));
    setPageError("");
    setSuccess("");
  }

  function discardChanges() {
    setDrafts({});
    setServerLatest({});
    setPageError("");
    setSuccess("");
  }

  async function saveAll() {
    const invalid = dirty.filter((entry) => validationError(entry, draftValue(entry)));
    if (invalid.length) {
      setPageError(content["content.error.validation"]);
      return;
    }
    setSaving(true);
    setPageError("");
    try {
      const response = await fetch("/api/admin/content", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ changes: dirty.map((entry) => ({
          key: entry.key, value: draftValue(entry), originalValue: entry.value, updatedAt: entry.updatedAt,
        })) }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; fields?: Record<string, string>; latest?: Record<string, string>; changedKeys?: string[] };
      if (!response.ok || !result.ok) {
        setServerLatest(result.latest ?? {});
        setPageError(result.error === "conflict" ? content["content.error.conflict"] : result.error === "validation" ? content["content.error.validation"] : content["content.error.server"]);
        if (result.fields) {
          setDrafts((current) => ({ ...current }));
        }
        setSaveConfirmation(false);
        return;
      }
      const refresh = await fetch("/api/admin/content", { cache: "no-store" });
      const refreshed = await refresh.json() as { entries: AdminContentEntry[] };
      setEntries(refreshed.entries);
      setDrafts({});
      setServerLatest({});
      setSuccess(content["content.success.saved"]);
      setSaveConfirmation(false);
      router.refresh();
    } catch {
      setPageError(content["content.error.server"]);
    } finally {
      setSaving(false);
    }
  }

  async function restoreHistory() {
    if (!restoreTarget) return;
    setRestoring(true);
    setRestoreMessage("");
    try {
      const response = await fetch(`/api/admin/content/history/${restoreTarget.id}/restore`, { method: "POST" });
      const result = await response.json() as { error?: string; changed?: boolean };
      if (!response.ok) throw new Error(result.error ?? "server");
      setRestoreTarget(null);
      setRestoreMessage(result.changed ? content["content.history.restore.success"] : content["content.history.no_change"]);
      if (result.changed) {
        setHistoryFilters((filters) => ({ ...filters }));
        firstHistoryLoad.current = false;
      }
    } catch {
      setRestoreMessage(content["content.error.server"]);
    } finally {
      setRestoring(false);
    }
  }

  function onTabsKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((tab) => tab.id === activeTab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    const tab = TABS[next];
    document.getElementById(`admin-content-tab-${tab.id}`)?.focus();
    changeTab(tab.id);
  }

  return (
    <div className="admin-content-page">
      <section className="admin-content-heading card">
        <div>
          <h1>{content["content.title"]}</h1>
          <p>{content["content.description"]}</p>
        </div>
        <a className="admin-content-open-site" href="/" target="_blank" rel="noopener noreferrer">
          <ArrowUpRight aria-hidden="true" size={17} /> {content["content.view_site"]}
        </a>
      </section>

      <div className="admin-content-info" role="note">
        <AlertCircle aria-hidden="true" size={18} />
        <span>{content["content.info"]}</span>
      </div>

      <div className="admin-content-tabs" role="tablist" aria-label={content["content.title"]} onKeyDown={onTabsKeyDown}>
        {TABS.map(({ id, key, icon: Icon }) => (
          <button
            aria-controls={`admin-content-panel-${id}`}
            aria-selected={activeTab === id}
            className={activeTab === id ? "admin-content-tab is-active" : "admin-content-tab"}
            id={`admin-content-tab-${id}`}
            key={id}
            onClick={() => changeTab(id)}
            role="tab"
            tabIndex={activeTab === id ? 0 : -1}
            type="button"
          >
            <Icon aria-hidden="true" size={16} /> {content[key]}
          </button>
        ))}
      </div>

      <section aria-labelledby={`admin-content-tab-${activeTab}`} className="admin-content-panel" id={`admin-content-panel-${activeTab}`} role="tabpanel">
        {activeTab === "text" && (
          <div className="admin-content-workspace">
            <aside className="admin-content-groups card" aria-label={content["content.tab.text"]}>
              <label className="admin-content-search">
                <Search aria-hidden="true" size={17} />
                <input aria-label={content["content.search"]} onChange={(event) => setSearch(event.target.value)} placeholder={content["content.search"]} value={search} />
              </label>
              <div className="admin-content-group-list">
                {groups.map((group) => {
                  const Icon = GROUP_ICONS[group] ?? FileText;
                  const count = entries.filter((entry) => entry.pageGroup === group).length;
                  return (
                    <button aria-current={selectedGroup === group ? "true" : undefined} className={selectedGroup === group ? "admin-content-group is-active" : "admin-content-group"} key={group} onClick={() => setSelectedGroup((value) => value === group ? "" : group)} type="button">
                      <Icon aria-hidden="true" size={17} />
                      <span>{getContentGroupLabel(group)}</span>
                      <small>{count}</small>
                    </button>
                  );
                })}
              </div>
            </aside>
            <div className="admin-content-entry-list">
              <label className="admin-content-mobile-group">
                <span>{content["content.history.group"]}</span>
                <select onChange={(event) => setSelectedGroup(event.target.value)} value={selectedGroup}>
                  <option value="">{content["content.history.all"]}</option>
                  {groups.map((group) => <option key={group} value={group}>{getContentGroupLabel(group)}</option>)}
                </select>
              </label>
              {visibleEntries.map((entry) => {
                const value = draftValue(entry);
                const error = validationError(entry, value);
                const isDirty = value !== entry.value;
                return (
                  <article className="admin-content-entry card" key={entry.key}>
                    <div className="admin-content-entry-title">
                      <div>
                        <h2>{entry.label}</h2>
                        <code>{entry.key}</code>
                      </div>
                      {isDirty && <span className="admin-content-unsaved">{content["content.field.unsaved"]}</span>}
                    </div>
                    <div className="admin-content-value-wrap">
                      {isLongText(entry.fallback) ? (
                        <textarea aria-label={entry.label} maxLength={2000} onChange={(event) => updateDraft(entry, event.target.value)} value={value} />
                      ) : (
                        <input aria-label={entry.label} maxLength={1000} onChange={(event) => updateDraft(entry, event.target.value)} value={value} />
                      )}
                      <span className="admin-content-character-count">{[...value].length}/{isLongText(entry.fallback) ? 2000 : 1000}</span>
                    </div>
                    {error && <p className="admin-content-field-error" role="alert">{error}</p>}
                    {serverLatest[entry.key] !== undefined && <div className="admin-content-conflict"><strong>{content["content.error.conflict"]}</strong><span>{serverLatest[entry.key]}</span></div>}
                    <div className="admin-content-preview"><small>{content["content.field.preview"]}</small><span>{value}</span></div>
                    <div className="admin-content-entry-footer">
                      <span>{entry.isStored ? `${content["content.field.updated"]} ${entry.updatedBy ?? content["content.field.unknown_user"]} · ${entry.updatedAt ? formatThaiDate(entry.updatedAt) : "-"}` : content["content.field.default"]}</span>
                      <button className="admin-content-reset" onClick={() => updateDraft(entry, entry.fallback)} type="button">{content["content.field.reset"]}</button>
                    </div>
                  </article>
                );
              })}
              {!visibleEntries.length && <div className="admin-content-empty card">{content["content.empty"]}</div>}
            </div>
          </div>
        )}

        {activeTab === "assets" && (
          <div className="admin-content-simple-panel">
            <section className="card admin-content-assets-card">
              <h2>{content["content.assets.heading"]}</h2>
              <p>{content["content.assets.description"]}</p>
              <div className="admin-content-logo-current">
                <Image
                  alt={logoView.alt}
                  className="admin-content-logo-image"
                  height={118}
                  src={logoView.src}
                  unoptimized
                  width={300}
                />
                <span className={logoView.isFallback ? "admin-content-logo-state is-fallback" : "admin-content-logo-state"}>
                  {content[logoView.isFallback ? "content.assets.logo.fallback" : "content.assets.logo.current"]}
                </span>
              </div>
              <h3 className="admin-content-subheading">{content["content.assets.logo.title"]}</h3>
              <form className="admin-content-logo-form" onSubmit={uploadLogo} ref={logoFormRef}>
                <label>
                  <span>{content["content.assets.logo.file"]}</span>
                  <input
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => {
                      setLogoFile(event.target.files?.[0] ?? null);
                      setLogoError("");
                    }}
                    type="file"
                  />
                </label>
                <label>
                  <span>{content["content.assets.logo.alt"]}</span>
                  <input
                    maxLength={255}
                    onChange={(event) => setLogoAlt(event.target.value)}
                    placeholder={content["content.assets.logo.alt.placeholder"]}
                    value={logoAlt}
                  />
                </label>
                <p className="admin-content-hint">{content["content.assets.logo.requirements"]}</p>
                {logoError && <p className="admin-content-field-error" role="alert">{logoError}</p>}
                <div className="admin-content-modal-actions">
                  <button
                    className="admin-content-secondary"
                    disabled={logoBusy || logoView.isFallback}
                    onClick={() => setLogoResetConfirm(true)}
                    type="button"
                  >
                    {content["content.assets.logo.reset"]}
                  </button>
                  <button className="admin-content-primary" disabled={logoBusy} type="submit">
                    {logoBusy ? content["content.assets.logo.uploading"] : content["content.assets.logo.upload"]}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {activeTab === "announcements" && (
          <div className="admin-content-announcements">
            <section className="card admin-content-announcements-toolbar">
              <label>
                <span>{content["content.search"]}</span>
                <input
                  onChange={(event) => changeAnnouncementFilter("q", event.target.value)}
                  placeholder={content["content.search"]}
                  value={announcementFilters.q}
                />
              </label>
              <label>
                <span>{content["content.announcements.column.status"]}</span>
                <select
                  onChange={(event) => changeAnnouncementFilter("status", event.target.value as AnnouncementFilters["status"])}
                  value={announcementFilters.status}
                >
                  <option value="all">{content["content.history.all"]}</option>
                  {(["active", "upcoming", "expired", "inactive"] as const).map((status) => (
                    <option key={status} value={status}>{content[STATUS_KEYS[status]]}</option>
                  ))}
                </select>
              </label>
              <button className="admin-content-primary" onClick={() => openAnnouncementForm()} type="button">
                <Plus aria-hidden="true" size={16} /> {content["content.announcements.add"]}
              </button>
            </section>

            {announcementLoading && <p className="admin-content-status" role="status">{content["content.announcements.loading"]}</p>}
            {announcementError && <p className="admin-content-field-error" role="alert">{announcementError}</p>}
            {!announcementLoading && announcementData.items.length === 0 && (
              <div className="admin-content-empty card">{content["content.announcements.empty"]}</div>
            )}

            {announcementData.items.length > 0 && (
              <>
                <div className="card admin-content-announce-table-wrap">
                  <table className="admin-content-history-table admin-content-announce-table">
                    <thead>
                      <tr>
                        <th>{content["content.announcements.column.title"]}</th>
                        <th>{content["content.announcements.column.body"]}</th>
                        <th>{content["content.announcements.column.period"]}</th>
                        <th>{content["content.announcements.column.status"]}</th>
                        <th>{content["content.announcements.column.actions"]}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {announcementData.items.map((item) => (
                        <tr key={item.id}>
                          <td><strong>{item.title}</strong></td>
                          <td><span className="admin-content-announce-body">{item.body || "-"}</span></td>
                          <td>{formatAnnouncementPeriod(item, content["content.announcements.no_end"])}</td>
                          <td><span className={`admin-content-status-pill is-${item.status}`}>{content[STATUS_KEYS[item.status]]}</span></td>
                          <td>
                            <div className="admin-content-row-actions">
                              <button aria-label={content["content.announcements.edit"]} className="admin-content-icon-button" onClick={() => openAnnouncementForm(item)} title={content["content.announcements.edit"]} type="button"><Pencil aria-hidden="true" size={15} /></button>
                              <button
                                aria-label={item.isActive ? content["content.announcements.disable"] : content["content.announcements.enable"]}
                                className="admin-content-icon-button"
                                onClick={() => setAnnouncementConfirm({ kind: "toggle", item })}
                                title={item.isActive ? content["content.announcements.disable"] : content["content.announcements.enable"]}
                                type="button"
                              >
                                {item.isActive ? <X aria-hidden="true" size={15} /> : <Check aria-hidden="true" size={15} />}
                              </button>
                              <button aria-label={content["content.announcements.delete"]} className="admin-content-icon-button is-danger" onClick={() => setAnnouncementConfirm({ kind: "delete", item })} title={content["content.announcements.delete"]} type="button"><Trash2 aria-hidden="true" size={15} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="admin-content-announce-cards">
                  {announcementData.items.map((item) => (
                    <article className="card admin-content-announce-card" key={item.id}>
                      <div className="admin-content-announce-card-head">
                        <strong>{item.title}</strong>
                        <span className={`admin-content-status-pill is-${item.status}`}>{content[STATUS_KEYS[item.status]]}</span>
                      </div>
                      <p className="admin-content-announce-body">{item.body || "-"}</p>
                      <small>{formatAnnouncementPeriod(item, content["content.announcements.no_end"])}</small>
                      <div className="admin-content-card-actions">
                        <button onClick={() => openAnnouncementForm(item)} type="button">{content["content.announcements.edit"]}</button>
                        <button onClick={() => setAnnouncementConfirm({ kind: "toggle", item })} type="button">{item.isActive ? content["content.announcements.disable"] : content["content.announcements.enable"]}</button>
                        <button className="is-danger" onClick={() => setAnnouncementConfirm({ kind: "delete", item })} type="button">{content["content.announcements.delete"]}</button>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="admin-content-pagination">
                  <span>{formatTemplate(content["content.pagination.summary"], {
                    from: (announcementData.page - 1) * 20 + 1,
                    to: Math.min(announcementData.page * 20, announcementData.total),
                    total: announcementData.total,
                  })}</span>
                  <div>
                    <button disabled={announcementData.page <= 1} onClick={() => changeAnnouncementFilter("page", announcementData.page - 1)} type="button"><ChevronLeft size={16} />{content["content.pagination.previous"]}</button>
                    <button disabled={announcementData.page * 20 >= announcementData.total} onClick={() => changeAnnouncementFilter("page", announcementData.page + 1)} type="button">{content["content.pagination.next"]}<ChevronRight size={16} /></button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "options" && (
          <div className="admin-content-options">
            <section className="card admin-content-options-intro">
              <p>{content["content.options.note"]}</p>
            </section>

            {optionLoading && <p className="admin-content-status" role="status">{content["content.options.loading"]}</p>}
            {optionError && <p className="admin-content-field-error" role="alert">{optionError}</p>}

            {OPTION_GROUPS.map((group) => {
              const definition = OPTION_DEFINITIONS[group];
              const data = optionData[group];
              const groupName = content[OPTION_GROUP_KEYS[group]];
              return (
                <section className="card admin-content-option-group" key={group}>
                  <button
                    aria-expanded={!optionCollapsed[group]}
                    className="admin-content-option-group-head"
                    onClick={() => toggleOptionCollapse(group)}
                    type="button"
                  >
                    {optionCollapsed[group] ? <ChevronDown aria-hidden="true" size={18} /> : <ChevronUp aria-hidden="true" size={18} />}
                    <strong>{formatTemplate(content["content.options.group.count"], { name: groupName, count: data.items.length })}</strong>
                  </button>

                  {!optionCollapsed[group] && (
                    <div className="admin-content-option-group-body">
                      {data.items.length === 0 && <p className="admin-content-status">{content["content.options.empty"]}</p>}
                      <div className="admin-content-option-list" role="list">
                        {data.items.map((item, index) => {
                          const detailKey = `${group}-${item.localId}`;
                          const isEditing = editingOption[group] === item.localId;
                          return (
                            <article
                              className={`admin-content-option-row${item.isActive ? "" : " is-inactive"}`}
                              key={item.localId}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault();
                                const from = Number(event.dataTransfer.getData("text/plain"));
                                if (Number.isSafeInteger(from)) moveOption(group, from, index);
                              }}
                              role="listitem"
                            >
                              <button
                                aria-label={content["content.options.drag"]}
                                className="admin-content-option-drag"
                                draggable
                                onDragStart={(event) => event.dataTransfer.setData("text/plain", String(index))}
                                title={content["content.options.drag"]}
                                type="button"
                              >
                                ⋮⋮
                              </button>

                              <div className="admin-content-option-order">
                                <button aria-label={content["content.options.action.move_up"]} disabled={index === 0} onClick={() => moveOption(group, index, index - 1)} title={content["content.options.action.move_up"]} type="button"><ChevronUp aria-hidden="true" size={14} /></button>
                                <span>{index + 1}</span>
                                <button aria-label={content["content.options.action.move_down"]} disabled={index === data.items.length - 1} onClick={() => moveOption(group, index, index + 1)} title={content["content.options.action.move_down"]} type="button"><ChevronDown aria-hidden="true" size={14} /></button>
                              </div>

                              <code className="admin-content-option-key">{item.key || content["content.options.pending"]}</code>

                              <div className="admin-content-option-name">
                                {isEditing ? (
                                  <input
                                    aria-label={content["content.options.field.name"]}
                                    maxLength={definition.maxNameLength}
                                    onChange={(event) => updateOption(group, item.localId, { nameTh: event.target.value })}
                                    onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        setEditingOption((current) => ({ ...current, [group]: null }));
                                      }
                                    }}
                                    value={item.nameTh}
                                  />
                                ) : (
                                  <button className="admin-content-option-name-button" onClick={() => setEditingOption((current) => ({ ...current, [group]: item.localId }))} type="button">{item.nameTh}</button>
                                )}
                                <button
                                  aria-label={isEditing ? content["content.options.edit.done"] : content["content.options.edit"]}
                                  className="admin-content-icon-button"
                                  onClick={() => setEditingOption((current) => ({ ...current, [group]: isEditing ? null : item.localId }))}
                                  title={isEditing ? content["content.options.edit.done"] : content["content.options.edit"]}
                                  type="button"
                                >
                                  {isEditing ? <Check aria-hidden="true" size={15} /> : <Pencil aria-hidden="true" size={15} />}
                                </button>
                              </div>

                              <button
                                aria-checked={item.isActive}
                                aria-label={content["content.options.field.active"]}
                                className={`admin-content-option-switch${item.isActive ? " is-on" : ""}`}
                                onClick={() => updateOption(group, item.localId, { isActive: !item.isActive })}
                                role="switch"
                                type="button"
                              >
                                <span />
                              </button>
                              <span className="admin-content-option-status">
                                {content[item.isActive ? "content.options.status.active" : "content.options.status.inactive"]}
                              </span>
                              {!item.isActive && <span className="admin-content-option-off-badge">{content["content.options.badge.inactive"]}</span>}
                              <small className="admin-content-option-usage">{formatTemplate(content["content.options.usage"], { count: item.usageCount })}</small>

                              {definition.supportsDescription && (
                                <div className="admin-content-option-detail">
                                  <button
                                    aria-expanded={Boolean(expandedOptionDetail[detailKey])}
                                    onClick={() => toggleOptionDetail(detailKey)}
                                    type="button"
                                  >
                                    {expandedOptionDetail[detailKey] ? content["content.options.details.close"] : content["content.options.details.open"]}
                                  </button>
                                  {expandedOptionDetail[detailKey] && (
                                    <div className="admin-content-option-detail-fields">
                                      <label>
                                        <span>{content["content.options.field.description"]}</span>
                                        <textarea
                                          maxLength={1000}
                                          onChange={(event) => updateOption(group, item.localId, { description: event.target.value })}
                                          value={item.description}
                                        />
                                        <small>{content["content.options.help.description"]}</small>
                                      </label>
                                      <label>
                                        <span>{content["content.options.field.example"]}</span>
                                        <textarea
                                          maxLength={1000}
                                          onChange={(event) => updateOption(group, item.localId, { example: event.target.value })}
                                          value={item.example}
                                        />
                                      </label>
                                    </div>
                                  )}
                                </div>
                              )}
                            </article>
                          );
                        })}
                      </div>
                      <button className="admin-content-secondary" onClick={() => setOptionAddForm({ group, code: "", nameTh: "" })} type="button">
                        <Plus aria-hidden="true" size={16} /> {content["content.options.add"]}
                      </button>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {activeTab === "history" && (
          <div className="admin-content-history card">
            <div className="admin-content-history-filters">
              <label><span>{content["content.history.from"]}</span><input onChange={(event) => changeHistoryFilter("from", event.target.value)} type="date" value={historyFilters.from} /></label>
              <label><span>{content["content.history.to"]}</span><input onChange={(event) => changeHistoryFilter("to", event.target.value)} type="date" value={historyFilters.to} /></label>
              <label><span>{content["content.history.editor"]}</span><select onChange={(event) => changeHistoryFilter("editor", event.target.value)} value={historyFilters.editor}><option value="">{content["content.history.all"]}</option>{historyData?.editors.map((editor) => <option key={editor.id} value={editor.id}>{editor.name}</option>)}</select></label>
              <label><span>{content["content.history.group"]}</span><select onChange={(event) => changeHistoryFilter("group", event.target.value)} value={historyFilters.group}><option value="">{content["content.history.all"]}</option>{historyData?.groups.map((group) => <option key={group} value={group}>{getContentGroupLabel(group)}</option>)}</select></label>
              <label className="admin-content-history-search"><span>{content["content.history.search"]}</span><input onChange={(event) => changeHistoryFilter("q", event.target.value)} placeholder={content["content.history.search"]} value={historyFilters.q} /></label>
            </div>
            {historyLoading && <p className="admin-content-status" role="status">{content["content.history.loading"]}</p>}
            {historyError && <p className="admin-content-field-error" role="alert">{content["content.history.error"]}</p>}
            {restoreMessage && <p className="admin-content-success" role="status">{restoreMessage}</p>}
            {!historyLoading && !historyError && historyData?.items.length === 0 && <p className="admin-content-status">{content["content.history.empty"]}</p>}
            {historyData && historyData.items.length > 0 && (
              <>
                <div className="admin-content-history-table-wrap">
                  <table className="admin-content-history-table">
                    <thead><tr><th>{content["content.history.date"]}</th><th>{content["content.history.editor"]}</th><th>{content["content.history.position"]}</th><th>{content["content.history.old"]}</th><th>{content["content.history.new"]}</th><th>{content["content.history.actions"]}</th></tr></thead>
                    <tbody>{historyData.items.map((item) => <HistoryRow key={item.id} item={item} content={content} expanded={expandedHistory} onExpand={(key) => setExpandedHistory((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; })} onRestore={() => setRestoreTarget(item)} />)}</tbody>
                  </table>
                </div>
                <div className="admin-content-history-cards">{historyData.items.map((item) => <HistoryCard key={item.id} item={item} content={content} expanded={expandedHistory} onExpand={(key) => setExpandedHistory((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; })} onRestore={() => setRestoreTarget(item)} />)}</div>
                <div className="admin-content-pagination">
                  <span>{formatTemplate(content["content.pagination.summary"], { from: (historyData.page - 1) * 20 + 1, to: Math.min(historyData.page * 20, historyData.total), total: historyData.total })}</span>
                  <div>
                    <button disabled={historyData.page <= 1} onClick={() => changeHistoryFilter("page", historyData.page - 1)} type="button"><ChevronLeft size={16} />{content["content.pagination.previous"]}</button>
                    <button disabled={historyData.page * 20 >= historyData.total} onClick={() => changeHistoryFilter("page", historyData.page + 1)} type="button">{content["content.pagination.next"]}<ChevronRight size={16} /></button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {activeTab === "text" && (
        <div className="admin-content-savebar">
          <span>{formatTemplate(content["content.unsaved.count"], { count: dirty.length })}</span>
          <div>
            <button className="admin-content-secondary" disabled={!dirty.length || saving} onClick={discardChanges} type="button">{content["content.action.discard"]}</button>
            <button className="admin-content-primary" disabled={!dirty.length || saving} onClick={() => setSaveConfirmation(true)} type="button">{saving ? content["content.action.saving"] : content["content.action.save_all"]}</button>
          </div>
        </div>
      )}

      {activeTab === "options" && (
        <div className="admin-content-savebar">
          <span>{formatTemplate(content["content.unsaved.count"], { count: optionChangeSummaries().length })}</span>
          <div>
            <button className="admin-content-secondary" disabled={!optionsDirty || optionBusy} onClick={discardOptionChanges} type="button">{content["content.action.discard"]}</button>
            <button className="admin-content-primary" disabled={!optionsDirty || optionBusy} onClick={() => setOptionConfirm(true)} type="button">{optionBusy ? content["content.action.saving"] : content["content.action.save_all"]}</button>
          </div>
        </div>
      )}

      {pageError && <div className="admin-content-toast error" role="alert">{pageError}</div>}
      {success && <div className="admin-content-toast success" role="status"><Check aria-hidden="true" size={17} />{success}</div>}

      {saveConfirmation && (
        <div className="admin-content-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setSaveConfirmation(false); }}>
          <section aria-labelledby="content-save-title" aria-modal="true" className="admin-content-modal" role="dialog">
            <button aria-label={content["content.action.close"]} className="admin-content-modal-close" onClick={() => setSaveConfirmation(false)} type="button"><X size={18} /></button>
            <h2 id="content-save-title">{content["content.confirm.save.title"]}</h2>
            <p>{content["content.confirm.save.description"]}</p>
            <div className="admin-content-confirm-list">{dirty.map((entry) => <article key={entry.key}><strong>{entry.label}</strong><code>{entry.key}</code><div><span><small>{content["content.confirm.save.old"]}</small>{entry.value}</span><span><small>{content["content.confirm.save.new"]}</small>{draftValue(entry)}</span></div></article>)}</div>
            <div className="admin-content-modal-actions"><button className="admin-content-secondary" disabled={saving} onClick={() => setSaveConfirmation(false)} type="button">{content["content.action.cancel"]}</button><button className="admin-content-primary" disabled={saving} onClick={saveAll} type="button">{saving ? content["content.action.saving"] : content["content.action.confirm"]}</button></div>
          </section>
        </div>
      )}

      {restoreTarget && (
        <div className="admin-content-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !restoring) setRestoreTarget(null); }}>
          <section aria-labelledby="content-restore-title" aria-modal="true" className="admin-content-modal" role="dialog">
            <button aria-label={content["content.action.close"]} className="admin-content-modal-close" onClick={() => setRestoreTarget(null)} type="button"><X size={18} /></button>
            <h2 id="content-restore-title">{content["content.history.confirm.title"]}</h2>
            <p><strong>{restoreTarget.label}</strong> · <code>{restoreTarget.key}</code></p>
            <div className="admin-content-restore-values"><span><small>{content["content.history.confirm.current"]}</small>{restoreTarget.currentValue}</span><span><small>{content["content.history.confirm.target"]}</small>{restoreTarget.oldValue}</span></div>
            <div className="admin-content-modal-actions"><button className="admin-content-secondary" disabled={restoring} onClick={() => setRestoreTarget(null)} type="button">{content["content.action.cancel"]}</button><button className="admin-content-primary" disabled={restoring} onClick={restoreHistory} type="button">{restoring ? content["content.action.saving"] : content["content.history.restore"]}</button></div>
          </section>
        </div>
      )}

      {optionAddForm && (
        <div className="admin-content-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOptionAddForm(null); }}>
          <section aria-labelledby="content-option-form-title" aria-modal="true" className="admin-content-modal" role="dialog">
            <button aria-label={content["content.action.close"]} className="admin-content-modal-close" onClick={() => setOptionAddForm(null)} type="button"><X size={18} /></button>
            <h2 id="content-option-form-title">{content["content.options.modal.add"]}</h2>
            {optionError && <p className="admin-content-field-error" role="alert">{optionError}</p>}
            <form
              className="admin-content-option-form"
              onSubmit={(event) => { event.preventDefault(); submitOptionAdd(); }}
            >
              {optionAddForm.group === "departments" && (
                <label>
                  <span>{content["content.options.column.code"]}</span>
                  <input
                    autoCapitalize="characters"
                    maxLength={20}
                    onChange={(event) => setOptionAddForm((current) => current ? { ...current, code: event.target.value } : current)}
                    value={optionAddForm.code}
                  />
                  <small>{content["content.options.help.key"]}</small>
                </label>
              )}
              <label>
                <span>{content["content.options.field.name"]}</span>
                <input
                  maxLength={OPTION_DEFINITIONS[optionAddForm.group].maxNameLength}
                  onChange={(event) => setOptionAddForm((current) => current ? { ...current, nameTh: event.target.value } : current)}
                  value={optionAddForm.nameTh}
                />
              </label>
              <div className="admin-content-modal-actions">
                <button className="admin-content-secondary" onClick={() => setOptionAddForm(null)} type="button">{content["content.options.confirm.cancel"]}</button>
                <button className="admin-content-primary" type="submit">{content["content.options.confirm.submit"]}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {optionConfirm && (
        <div className="admin-content-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !optionBusy) setOptionConfirm(false); }}>
          <section aria-labelledby="content-option-confirm-title" aria-modal="true" className="admin-content-modal" role="dialog">
            <button aria-label={content["content.action.close"]} className="admin-content-modal-close" onClick={() => setOptionConfirm(false)} type="button"><X size={18} /></button>
            <h2 id="content-option-confirm-title">{content["content.options.confirm.title"]}</h2>
            <p>{content["content.options.confirm.description"]}</p>
            <div className="admin-content-confirm-list">
              {(optionChangeSummaries().length > 0
                ? optionChangeSummaries()
                : [content["content.options.confirm.none"]]
              ).map((line, index) => <article key={`${line}-${index}`}>{line}</article>)}
            </div>
            <div className="admin-content-modal-actions">
              <button className="admin-content-secondary" disabled={optionBusy} onClick={() => setOptionConfirm(false)} type="button">{content["content.action.cancel"]}</button>
              <button className="admin-content-primary" disabled={optionBusy} onClick={() => void saveAllOptions()} type="button">{optionBusy ? content["content.action.saving"] : content["content.action.confirm"]}</button>
            </div>
          </section>
        </div>
      )}

      {announcementForm && (
        <div className="admin-content-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !announcementLoading) setAnnouncementForm(null); }}>
          <section aria-labelledby="content-announcement-form-title" aria-modal="true" className="admin-content-modal" role="dialog">
            <button aria-label={content["content.action.close"]} className="admin-content-modal-close" onClick={() => setAnnouncementForm(null)} type="button"><X size={18} /></button>
            <h2 id="content-announcement-form-title">
              {content[announcementForm.id ? "content.announcements.modal.edit" : "content.announcements.modal.add"]}
            </h2>
            {announcementError && <p className="admin-content-field-error" role="alert">{announcementError}</p>}
            <form className="admin-content-announce-form" onSubmit={(event) => { event.preventDefault(); void saveAnnouncement(); }}>
              <label>
                <span>{content["content.announcements.field.title"]}</span>
                <input
                  maxLength={200}
                  onChange={(event) => setAnnouncementForm((current) => current ? { ...current, title: event.target.value } : current)}
                  value={announcementForm.title}
                />
              </label>
              <label>
                <span>{content["content.announcements.field.body"]}</span>
                <textarea
                  maxLength={1000}
                  onChange={(event) => setAnnouncementForm((current) => current ? { ...current, body: event.target.value } : current)}
                  placeholder={content["content.announcements.body.placeholder"]}
                  value={announcementForm.body}
                />
                <small>{content["content.announcements.help.body"]}</small>
              </label>
              <div className="admin-content-announce-dates">
                <label>
                  <span>{content["content.announcements.field.start"]}</span>
                  <input onChange={(event) => setAnnouncementForm((current) => current ? { ...current, startDate: event.target.value } : current)} type="date" value={announcementForm.startDate} />
                  <small>{content["content.announcements.help.date"]} {formatThaiShortDate(announcementForm.startDate)}</small>
                </label>
                <label>
                  <span>{content["content.announcements.field.end"]}</span>
                  <input onChange={(event) => setAnnouncementForm((current) => current ? { ...current, endDate: event.target.value } : current)} type="date" value={announcementForm.endDate} />
                  <small>{content["content.announcements.help.date"]} {formatThaiShortDate(announcementForm.endDate)}</small>
                </label>
              </div>
              <label className="admin-content-checkbox">
                <input
                  checked={announcementForm.isActive}
                  onChange={(event) => setAnnouncementForm((current) => current ? { ...current, isActive: event.target.checked } : current)}
                  type="checkbox"
                />
                <span>{content["content.announcements.field.active"]}</span>
              </label>
              <div className="admin-content-modal-actions">
                <button className="admin-content-secondary" disabled={announcementLoading} onClick={() => setAnnouncementForm(null)} type="button">{content["content.announcements.confirm.cancel"]}</button>
                <button className="admin-content-primary" disabled={announcementLoading} type="submit">{announcementLoading ? content["content.action.saving"] : content["content.action.confirm"]}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {announcementConfirm && (
        <div className="admin-content-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !announcementLoading) setAnnouncementConfirm(null); }}>
          <section aria-labelledby="content-announcement-confirm-title" aria-modal="true" className="admin-content-modal" role="dialog">
            <button aria-label={content["content.action.close"]} className="admin-content-modal-close" onClick={() => setAnnouncementConfirm(null)} type="button"><X size={18} /></button>
            <h2 id="content-announcement-confirm-title">{content["content.announcements.heading"]}</h2>
            <p>{formatTemplate(
              content[announcementConfirm.kind === "delete" ? "content.announcements.confirm.delete" : "content.announcements.confirm.toggle"],
              {
                title: announcementConfirm.item.title,
                action: content[announcementConfirm.item.isActive ? "content.announcements.disable" : "content.announcements.enable"],
              },
            )}</p>
            <div className="admin-content-modal-actions">
              <button className="admin-content-secondary" disabled={announcementLoading} onClick={() => setAnnouncementConfirm(null)} type="button">{content["content.announcements.confirm.cancel"]}</button>
              <button className="admin-content-primary" disabled={announcementLoading} onClick={() => void applyAnnouncementConfirm()} type="button">{content["content.announcements.confirm.submit"]}</button>
            </div>
          </section>
        </div>
      )}

      {logoResetConfirm && (
        <div className="admin-content-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !logoBusy) setLogoResetConfirm(false); }}>
          <section aria-labelledby="content-logo-reset-title" aria-modal="true" className="admin-content-modal" role="dialog">
            <button aria-label={content["content.action.close"]} className="admin-content-modal-close" onClick={() => setLogoResetConfirm(false)} type="button"><X size={18} /></button>
            <h2 id="content-logo-reset-title">{content["content.assets.logo.reset"]}</h2>
            <p>{content["content.assets.logo.reset_confirm"]}</p>
            <div className="admin-content-modal-actions">
              <button className="admin-content-secondary" disabled={logoBusy} onClick={() => setLogoResetConfirm(false)} type="button">{content["content.action.cancel"]}</button>
              <button className="admin-content-primary" disabled={logoBusy} onClick={() => void resetLogo()} type="button">{content["content.announcements.confirm.submit"]}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function HistoryRow({ item, content, expanded, onExpand, onRestore }: {
  item: HistoryItem;
  content: SiteContent;
  expanded: Set<string>;
  onExpand: (key: string) => void;
  onRestore: () => void;
}) {
  return (
    <tr>
      <td>{formatThaiDate(item.changedAt)}</td>
      <td>{item.changedBy ?? content["content.history.unknown_user"]}</td>
      <td><strong>{item.label}</strong><code>{item.key}</code></td>
      <td><HistoryValue value={item.oldValue} itemKey={`${item.id}-old`} content={content} expanded={expanded} onExpand={onExpand} /></td>
      <td><HistoryValue value={item.newValue} itemKey={`${item.id}-new`} content={content} expanded={expanded} onExpand={onExpand} /></td>
      <td><button className="admin-content-restore-button" onClick={onRestore} type="button"><RotateCcw aria-hidden="true" size={15} />{content["content.history.restore"]}</button></td>
    </tr>
  );
}

function HistoryCard({ item, content, expanded, onExpand, onRestore }: {
  item: HistoryItem;
  content: SiteContent;
  expanded: Set<string>;
  onExpand: (key: string) => void;
  onRestore: () => void;
}) {
  return (
    <article className="admin-content-history-card">
      <div><strong>{item.label}</strong><code>{item.key}</code></div>
      <p>{formatThaiDate(item.changedAt)} · {item.changedBy ?? content["content.history.unknown_user"]}</p>
      <HistoryValue value={item.oldValue} itemKey={`${item.id}-old`} content={content} expanded={expanded} onExpand={onExpand} />
      <HistoryValue value={item.newValue} itemKey={`${item.id}-new`} content={content} expanded={expanded} onExpand={onExpand} />
      <button className="admin-content-restore-button" onClick={onRestore} type="button"><RotateCcw aria-hidden="true" size={15} />{content["content.history.restore"]}</button>
    </article>
  );
}

function HistoryValue({ value, itemKey, content, expanded, onExpand }: {
  value: string;
  itemKey: string;
  content: SiteContent;
  expanded: Set<string>;
  onExpand: (key: string) => void;
}) {
  const isExpanded = expanded.has(itemKey);
  return (
    <div className={itemKey.endsWith("-old") ? "admin-content-history-value is-old" : "admin-content-history-value is-new"}>
      <span className={isExpanded ? "is-expanded" : ""}>{value}</span>
      {[...value].length > 100 && <button onClick={() => onExpand(itemKey)} type="button">{isExpanded ? content["content.history.collapse"] : content["content.history.expand"]}</button>}
    </div>
  );
}
