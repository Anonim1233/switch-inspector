/**
 * Единая точка обращения к API.
 *
 * Здесь собрано всё, что раньше делала функция apiFetch: подстановка
 * токена, разбор ответа и приведение ошибок сервера к понятному виду.
 * Компоненты не работают с fetch напрямую — только через этот модуль,
 * поэтому изменение формата запросов затрагивает одно место.
 */

const BASE = import.meta.env.VITE_API_BASE ?? '';

/** Ключ хранения токена. Совпадает с прежней версией, поэтому
 *  пользователям не придётся входить заново после обновления. */
const TOKEN_KEY = 'sw-token';

/* Приложение может открываться в средах, где localStorage запрещён
   (изолированные рамки, режимы предпросмотра). Обращение к нему бросает
   исключение и без обёртки прервало бы загрузку целиком. */
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(value) {
  try {
    localStorage.setItem(TOKEN_KEY, value);
  } catch {
    /* хранилище недоступно — токен проживёт до перезагрузки страницы */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* нечего очищать */
  }
}

/** Ошибка запроса. Несёт код ответа, чтобы вызывающий код мог различать
 *  «сессия истекла» и «нет прав», не разбирая текст сообщения. */
export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }

  /** Сессия истекла либо токен недействителен. */
  get isUnauthorized() {
    return this.status === 401;
  }

  /** Действие запрещено: не хватает роли либо объект вне зоны ответственности. */
  get isForbidden() {
    return this.status === 403;
  }
}

/**
 * Выполняет запрос к API.
 *
 * @param {string} path — путь, начиная со слеша
 * @param {object} [options] — те же параметры, что у fetch
 * @returns {Promise<any>} разобранный ответ
 * @throws {ApiError} при ответе с кодом ошибки или сбое сети
 */
export async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };

  /* Content-Type ставится только при наличии тела: для GET-запросов он
     не нужен, а с FormData браузер обязан выставить заголовок сам —
     вместе с разделителем частей, которого мы не знаем. */
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(BASE + path, { ...options, headers });
  } catch (cause) {
    /* Сюда попадают только сбои сети: недоступный сервер, обрыв связи.
       Ответы с кодом ошибки исключения не вызывают и обрабатываются ниже. */
    throw new ApiError('Нет связи с сервером', 0, { cause });
  }

  if (response.status === 204) return null;

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const message = payload?.error ?? `Ошибка сервера: ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }

  return payload;
}

/** Сокращения для частых случаев — чтобы не писать метод и тело руками. */
export const api = {
  get: (path) => apiFetch(path),
  post: (path, body) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => apiFetch(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => apiFetch(path, { method: 'DELETE' }),
};

/**
 * Загрузка файла с авторизацией.
 *
 * Обычная ссылка здесь не подходит: браузер не добавит к ней заголовок
 * с токеном, и сервер ответит отказом. Поэтому файл запрашивается
 * запросом, а затем сохраняется через временную ссылку.
 */
export async function downloadFile(path, filename) {
  const token = getToken();
  const response = await fetch(BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    let message = 'Не удалось получить файл';
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
    } catch {
      /* тело не в формате JSON — оставляем общее сообщение */
    }
    throw new ApiError(message, response.status);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
