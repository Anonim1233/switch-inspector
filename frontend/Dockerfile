# ═══════════════════════════════════════════════════════════════════════
# Образ интерфейса: сборка, затем отдача статики
# ═══════════════════════════════════════════════════════════════════════

# ── Сборка ──
FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Отдача ──
# В итоговый образ попадает только результат сборки: ни исходников,
# ни зависимостей разработки, ни самого сборщика.
# Вариант образа, рассчитанный на работу без прав администратора:
# обычный требует записи в системные каталоги и слушает порт 80,
# для которого нужны привилегии. Этот слушает 8080 и работает
# от обычного пользователя.
FROM nginxinc/nginx-unprivileged:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
