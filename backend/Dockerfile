# ═══════════════════════════════════════════════════════════════════════
# Образ сервера
# ═══════════════════════════════════════════════════════════════════════
FROM node:22-alpine

# Шрифты с кириллицей нужны для PDF-отчёта: встроенные шрифты формата
# кириллицу не содержат вовсе, и первая же русская буква даёт ошибку.
# postgresql-client — для резервного копирования, если оно выполняется
# из контейнера.
RUN apk add --no-cache font-dejavu postgresql-client

WORKDIR /app

# Зависимости отдельным слоем: пересобираются только при изменении
# package.json, а не при каждой правке кода.
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# Работа не от имени администратора — образ node уже содержит
# подходящего пользователя.
USER node

EXPOSE 3000

# Проверка живости для оркестратора
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
