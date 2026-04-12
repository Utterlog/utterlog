import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from './api';

interface User {
  id: number;
  username: string;
  email: string;
  nickname?: string;
  role: string;
  avatar?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setAccessToken: (token: string) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: User | null) => void;
  setAuth: (user: User, accessToken: string, refreshToken?: string) => void;
  checkAuth: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const response: any = await authApi.login(email, password);
          const { user, access_token, refresh_token } = response.data;
          set({
            user,
            accessToken: access_token,
            refreshToken: refresh_token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: () => {
        authApi.logout().catch(() => {});
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },

      setAccessToken: (token: string) => {
        set({ accessToken: token });
      },

      setTokens: (accessToken: string, refreshToken: string) => {
        set({ accessToken, refreshToken });
      },

      setUser: (user: User | null) => {
        set({ user, isAuthenticated: !!user });
      },

      setAuth: (user: User, accessToken: string, refreshToken?: string) => {
        set({ user, accessToken, refreshToken: refreshToken ?? null, isAuthenticated: true });
      },

      checkAuth: async () => {
        const { accessToken } = get();
        if (!accessToken) return false;

        try {
          const response: any = await authApi.me();
          set({ user: response.data, isAuthenticated: true });
          return true;
        } catch (err: any) {
          // 401 = token invalid, clear auth
          // Network error / other = backend unreachable, keep auth state
          const status = err?.response?.status;
          if (status === 401 || status === 403) {
            set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
            return false;
          }
          // Backend unreachable — trust existing token
          return true;
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Theme state
export type Theme = 'steel' | 'blue' | 'green' | 'mint' | 'claude' | 'ocean' | 'dark';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'steel',
      setTheme: (theme: Theme) => {
        if (typeof document !== 'undefined') {
          document.documentElement.dataset.theme = theme;
        }
        set({ theme });
      },
    }),
    {
      name: 'utterlog-theme',
      onRehydrateStorage: () => (state) => {
        if (state?.theme && typeof document !== 'undefined') {
          document.documentElement.dataset.theme = state.theme;
        }
      },
    }
  )
);

// Sidebar state
interface SidebarState {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: true,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  close: () => set({ isOpen: false }),
}));

// Global music player state
export interface GlobalSong {
  id: string; title: string; artist: string; cover: string; url: string;
  server: string; pic_id?: string; url_id?: string; lyric_id?: string;
}

interface MusicPlayerState {
  playlist: GlobalSong[];
  idx: number;
  playing: boolean;
  visible: boolean; // mini player visibility
  setPlaylist: (songs: GlobalSong[], startIdx?: number) => void;
  setIdx: (i: number) => void;
  setPlaying: (p: boolean) => void;
  show: () => void;
  hide: () => void;
}

export const useMusicStore = create<MusicPlayerState>((set) => ({
  playlist: [],
  idx: 0,
  playing: false,
  visible: false,
  setPlaylist: (songs, startIdx = 0) => set({ playlist: songs, idx: startIdx, visible: true }),
  setIdx: (i) => set({ idx: i }),
  setPlaying: (p) => set({ playing: p }),
  show: () => set({ visible: true }),
  hide: () => set({ visible: false, playing: false }),
}));
