export type ThemeSetting = "system" | "light" | "dark";

export interface DesignSource {
  kind: "screen" | "template" | "app";
  id: string;
  version?: string;
  app?: string;
}

/** A design card: real running code from the working area, or a library screenshot. */
export interface Design {
  id: string;
  title: string;
  summary?: string;
  author?: string;
  format: "desktop" | "mobile";
  /** Path on the content origin (`/designs/<id>/`) or a loopback dev URL. */
  src?: string;
  /** Screenshot URL, for library items and previews. */
  image?: string;
  /** Hosted original (library items); opens in a new tab. */
  previewUrl?: string | null;
  parentId?: string;
  action?: string;
  source?: DesignSource;
  createdAt?: string;
  /** True for designs your AI wrote into the workspace's working area. */
  local?: boolean;
  requestId?: string | null;
  appId?: string | null;
  /** A whole app, served at the root of its own local address. */
  root?: boolean;
  /** The prototype's runnable source, for Edit and Use this. */
  sourceDir?: string;
  /** A local dev server address for the item (unused in Explore). */
  editUrl?: string;
  /** Its folder in a Congo file, and that file's name. */
  dir?: string;
  file?: string;
  /** adapting: no preview yet; main: the main screen is adapted; expanding; ready; error. */
  status?: "adapting" | "main" | "expanding" | "ready" | "error";
  error?: string;
  /** Product ideas carry a short brief; design-only prototypes have none. */
  brief?: Brief;
  builtAt?: string;
}

export interface Brief {
  who?: string;
  why?: string;
  supports?: string;
  next?: string;
  text?: string;
}

export interface SavedState {
  available: boolean;
  signedIn: boolean | null;
  ids: string[];
  slugs: string[];
  reason: string | null;
}

export interface LibraryApp {
  id: string;
  slug: string;
  name: string;
  summary: string;
  category: string | null;
  pageCount: number | null;
  access: string;
  logo: string | null;
  screenshot: string | null;
  screenshots: string[];
  preview: string | null;
  inspiredBy: string | null;
  url: string;
  release: string | null;
}

export interface LibraryScreen {
  id: string;
  title: string;
  route: string | null;
  app: { id: string; slug: string; name: string } | null;
  categories: string[];
  screenshot: string | null;
  format: "desktop" | "mobile";
  preview: string | null;
  url: string | null;
  version: string | null;
  source: { kind: "screen" | "template" | "app"; id: string; version?: string } | null;
}

export interface ScreenCategory {
  id: string;
  title: string;
  group: string | null;
}

/** A project the person's AI works in (the folder it connected from). */
export interface ProjectRef {
  name: string;
  path: string;
}

export interface SelectionItem {
  kind: "screen" | "template" | "app";
  id: string;
  sourceId?: string;
  title: string;
  app: { id: string | null; slug: string | null; name: string | null } | null;
  image: string | null;
  route?: string | null;
  url?: string | null;
}

export interface CanvasSummary {
  id: string;
  title: string;
  project: string | null;
}

export interface Canvas {
  id: string;
  title: string;
  sections: {
    id: number;
    kind: "review" | "compare";
    title: string | null;
    decisions: number[];
    cards: { id: number; title: string; note: string; approvable: boolean; references: SelectionItem[] }[];
  }[];
}

export interface WorkspaceState {
  settings: { theme: ThemeSetting };
  tray: { items: SelectionItem[] };
}

export interface WorkspaceStatus {
  protocol: number;
  version: string;
  registry: string;
  ai: {
    connected: boolean;
    listening: boolean;
    pending: number;
  };
  project: ProjectRef | null;
}
