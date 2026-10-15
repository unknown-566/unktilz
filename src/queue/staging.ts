import { create } from 'zustand';

// Files picked for a tool but not run yet, keyed by tool slug.
// Kept outside the page so the queue rail's picker can hand files to a tool page.
type StagingState = {
  files: Record<string, File[]>;
  add: (slug: string, files: File[]) => void;
  set: (slug: string, files: File[]) => void;
  clear: (slug: string) => void;
};

export const useStaging = create<StagingState>()((set, get) => ({
  files: {},
  add: (slug, files) => set({ files: { ...get().files, [slug]: [...(get().files[slug] ?? []), ...files] } }),
  set: (slug, files) => set({ files: { ...get().files, [slug]: files } }),
  clear: (slug) => {
    const { [slug]: _, ...rest } = get().files;
    set({ files: rest });
  },
}));
