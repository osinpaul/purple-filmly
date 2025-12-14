# Filmly Dev API

Небольшой Express‑сервер для локального тестирования клиентского приложения Filmly. Ниже — как поднять и использовать dev API.

## Требования
- Node.js 18+ (LTS) и npm

## Установка
```bash
npm install
```

## Запуск
- По умолчанию: `npm run start:api`
- Переменные окружения:
  - `PORT` — порт сервера (по умолчанию 3000)
  - `JWT_SECRET` — секрет для подписи JWT (по умолчанию dev‑строка)
  - `JWT_EXPIRES_IN` — время жизни токена (секунды или формат `10m`, `1h`, по умолчанию 3600)

Пример:  
```bash
PORT=4000 JWT_SECRET=my-secret npm run start:api
```

## Документация
- Swagger UI: `http://localhost:<PORT>/docs`
- Базовый префикс API: `http://localhost:<PORT>/api/v1`

## Быстрый сценарий работы
1) Получить токен:
```bash
curl -X POST http://localhost:3000/api/v1/auth \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"any"}'
```
2) Использовать `accessToken` в заголовке `Authorization: Bearer <token>`:
```bash
# Получить жанры
curl http://localhost:3000/api/v1/genres \
  -H "Authorization: Bearer <token>"

# Добавить фильм в избранное
curl -X PATCH http://localhost:3000/api/v1/favorites \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"movieId":"m_004"}'
```

Основные маршруты: `/auth`, `/genres`, `/movies`, `/favorites` (PATCH/DELETE). Для сортировки и фильтрации фильмов смотрите параметры в Swagger.
