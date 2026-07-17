import axios from "axios";

export const api = axios.create({
  baseURL: "http://192.168.1.132:8000",
  timeout: 60000,
});

// JSON helpers
export async function apiGet(url) {
  const res = await api.get(url);
  return res.data;
}

export async function apiPost(url, body) {
  const res = await api.post(url, body);
  return res.data;
}

export async function apiPatch(url, body) {
  const res = await api.patch(url, body);
  return res.data;
}

export async function apiDelete(url) {
  const res = await api.delete(url);
  return res.data;
}

// FormData helper (for uploads only)
export async function apiPostForm(url, formData) {
  const res = await api.post(url, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}
