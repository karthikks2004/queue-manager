import axios from 'axios'

const API = axios.create({ baseURL: '/api' })

API.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

export interface Manager { id: number; username: string }
export interface Queue {
  id: number; name: string; description: string; manager_id: number;
  created_at: string; waiting_count: number; served_count: number; cancelled_count: number
}
export interface Token {
  id: number; token_number: string; person_name: string; phone: string;
  queue_id: number; position: number; status: string; priority: number;
  notes: string; created_at: string; served_at?: string; wait_time_seconds?: number
}
export interface Analytics {
  summary: { totalQueues: number; totalTokens: number; served: number; waiting: number; cancelled: number; avgWaitSeconds: number }
  queueStats: { id: number; name: string; waiting: number; served: number; cancelled: number; avg_wait: number }[]
  hourlyTrend: { hour: string; tokens_added: number; served: number }[]
}

export const auth = {
  login: (u: string, p: string) => API.post('/login', { username: u, password: p }),
  register: (u: string, p: string) => API.post('/register', { username: u, password: p }),
}
export const queues = {
  list: () => API.get<Queue[]>('/queues'),
  create: (name: string, description?: string) => API.post<Queue>('/queues', { name, description }),
  update: (id: number, name: string, description: string) => API.put(`/queues/${id}`, { name, description }),
  delete: (id: number) => API.delete(`/queues/${id}`),
}
export const tokens = {
  list: (queueId: number) => API.get<Token[]>(`/queues/${queueId}/tokens`),
  history: (queueId: number) => API.get<Token[]>(`/queues/${queueId}/tokens/history`),
  add: (queueId: number, data: { person_name: string; phone?: string; priority?: number; notes?: string }) =>
    API.post<Token>(`/queues/${queueId}/tokens`, data),
  moveUp: (id: number) => API.patch(`/tokens/${id}/move-up`),
  moveDown: (id: number) => API.patch(`/tokens/${id}/move-down`),
  serve: (id: number) => API.patch(`/tokens/${id}/serve`),
  cancel: (id: number) => API.patch(`/tokens/${id}/cancel`),
}
export const analytics = {
  get: () => API.get<Analytics>('/analytics'),
}

export default API
