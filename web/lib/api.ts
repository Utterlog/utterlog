import axios, { AxiosError, AxiosInstance } from 'axios';
import { useAuthStore } from './store';

const api: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  async (error: AxiosError) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean };

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const refreshResponse = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL || '/api/v1'}/auth/refresh`,
          { refresh_token: refreshToken },
        );

        const { access_token, refresh_token } = refreshResponse.data.data;
        useAuthStore.getState().setTokens(access_token, refresh_token);

        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch {
        useAuthStore.getState().logout();
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (data: { username: string; email: string; password: string }) =>
    api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  refresh: () => api.post('/auth/refresh'),
  me: () => api.get('/auth/me'),
};

// Posts API
export const postsApi = {
  list: (params?: { page?: number; limit?: number; status?: string; search?: string }) =>
    api.get('/posts', { params }),
  get: (id: number) => api.get(`/posts/${id}`),
  create: (data: any) => api.post('/posts', data),
  update: (id: number, data: any) => api.put(`/posts/${id}`, data),
  delete: (id: number) => api.delete(`/posts/${id}`),
};

// Categories API
export const categoriesApi = {
  list: () => api.get('/categories'),
  create: (data: any) => api.post('/categories', data),
  update: (id: number, data: any) => api.put(`/categories/${id}`, data),
  delete: (id: number) => api.delete(`/categories/${id}`),
};

// Tags API
export const tagsApi = {
  list: (params?: { page?: number; limit?: number; search?: string }) =>
    api.get('/tags', { params }),
  create: (data: any) => api.post('/tags', data),
  update: (id: number, data: any) => api.put(`/tags/${id}`, data),
  delete: (id: number) => api.delete(`/tags/${id}`),
};

// Comments API
export const commentsApi = {
  list: (params?: { page?: number; limit?: number; status?: string; post_id?: number }) =>
    api.get('/comments', { params }),
  update: (id: number, data: any) => api.put(`/comments/${id}`, data),
  delete: (id: number) => api.delete(`/comments/${id}`),
  reply: (id: number, content: string) => api.post(`/comments/${id}/reply`, { content }),
};

// Links API
export const linksApi = {
  list: () => api.get('/links'),
  create: (data: any) => api.post('/links', data),
  update: (id: number, data: any) => api.put(`/links/${id}`, data),
  delete: (id: number) => api.delete(`/links/${id}`),
};

// Media API
export const mediaApi = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  list: () => api.get('/media'),
  delete: (id: number) => api.delete(`/media/${id}`),
};

// Options API
export const optionsApi = {
  list: () => api.get('/options'),
  get: async (name: string) => {
    const r: any = await api.get('/options');
    const data = r.data || r;
    return { data: { value: data[name] } };
  },
  update: (name: string, value: any) => api.put('/options', { [name]: value }),
  updateMany: (data: Record<string, any>) => api.put('/options', data),
};

// Import API
export const importApi = {
  typecho: (data: { host: string; database: string; username: string; password: string; prefix: string }) =>
    api.post('/import/typecho', data),
  wordpress: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/import/wordpress', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Moments API
export const momentsApi = {
  list: (params?: any) => api.get('/moments', { params }),
  get: (id: number) => api.get(`/moments/${id}`),
  create: (data: any) => api.post('/moments', data),
  update: (id: number, data: any) => api.put(`/moments/${id}`, data),
  delete: (id: number) => api.delete(`/moments/${id}`),
};

// Music API
export const musicApi = {
  list: (params?: any) => api.get('/music', { params }),
  get: (id: number) => api.get(`/music/${id}`),
  create: (data: any) => api.post('/music', data),
  update: (id: number, data: any) => api.put(`/music/${id}`, data),
  delete: (id: number) => api.delete(`/music/${id}`),
};

// Movies API
export const moviesApi = {
  list: (params?: any) => api.get('/movies', { params }),
  get: (id: number) => api.get(`/movies/${id}`),
  create: (data: any) => api.post('/movies', data),
  update: (id: number, data: any) => api.put(`/movies/${id}`, data),
  delete: (id: number) => api.delete(`/movies/${id}`),
};

// Books API
export const booksApi = {
  list: (params?: any) => api.get('/books', { params }),
  get: (id: number) => api.get(`/books/${id}`),
  create: (data: any) => api.post('/books', data),
  update: (id: number, data: any) => api.put(`/books/${id}`, data),
  delete: (id: number) => api.delete(`/books/${id}`),
};

// Goods API
export const goodsApi = {
  list: (params?: any) => api.get('/goods', { params }),
  get: (id: number) => api.get(`/goods/${id}`),
  create: (data: any) => api.post('/goods', data),
  update: (id: number, data: any) => api.put(`/goods/${id}`, data),
  delete: (id: number) => api.delete(`/goods/${id}`),
};

// Playlists API
export const playlistsApi = {
  list: () => api.get("/playlists"),
  get: (id: number) => api.get(`/playlists/${id}`),
  create: (data: any) => api.post("/playlists", data),
  update: (id: number, data: any) => api.put(`/playlists/${id}`, data),
  delete: (id: number) => api.delete(`/playlists/${id}`),
  addSong: (id: number, musicId: number) => api.post(`/playlists/${id}/songs`, { music_id: musicId }),
  removeSong: (id: number, musicId: number) => api.delete(`/playlists/${id}/songs`, { data: { music_id: musicId } }),
  import: (server: string, playlistId: string, title: string) => api.post("/playlists/import", { server, playlist_id: playlistId, title }),
};

// RSS API
export const rssApi = {
  parse: (url: string) => api.get('/rss/parse', { params: { url } }),
};

export default api;
