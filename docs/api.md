# HTTP API

Справочник по всем 13 методам Next.js. Идентификаторы и данные в примерах условные. Объекты сделок и массивы свечей сокращены.

## Оглавление

- [Доступ и ошибки](#доступ-и-ошибки)
- [Маршруты](#маршруты)
- [Примеры](#примеры)
- [Известные ограничения](#известные-ограничения)

## Доступ и ошибки

Запросы к закрытым маршрутам передают cookie `trademind_session`. Проверки роли и владельца выполняет сервер. Успешный ответ — 200, если явно не указано 201. Ошибки приложения имеют вид `{"error":"…"}`. Общий обработчик серверных маршрутов возвращает 500 при необработанных ошибках, 503 при отсутствующей конфигурации Supabase. [Код API](../src/app/api) · [Авторизация](auth.md)

## Маршруты

| Метод | Путь | Доступ | Параметры | Ошибки маршрута |
|---|---|---|---|---|
| `POST` | `/api/auth/login` | Все | JSON: username, password | 401 неверные данные |
| `POST` | `/api/auth/logout` | Все | Без тела | — |
| `GET` | `/api/auth/me` | Сессия | Без параметров | 401 |
| `GET` | `/api/users` | admin | Без параметров | 401, 403 |
| `POST` | `/api/users` | admin | JSON: username, password, role, balance | 400 валидация, 401, 403, 409 занят логин |
| `PATCH` | `/api/users/:id` | admin | Путь: id. JSON: username, password, balance, role — поля необязательны | 400, 401, 403, 404, 409 занят логин или попытка снять свою роль |
| `DELETE` | `/api/users/:id` | admin | Путь: id | 401, 403, 404, 409 удаление себя |
| `GET` | `/api/trades?scenario_id=uptrend-basics` | Сессия | Query: scenario_id (необязателен) | 400 неизвестный сценарий, 401 |
| `POST` | `/api/trades` | Сессия | JSON: session_id, scenario_id, side, quantity, expected_candle_index, stop_loss (может быть null) | 400 валидация, 401, 409 не хватает средств, сессия или индекс изменились |
| `POST` | `/api/trades/:id/close` | Сессия | Путь: id сделки | 400 нет цены сценария, 401, 404, 409 конфликт закрытия |
| `POST` | `/api/simulations/advance` | Сессия | JSON: session_id | 400 нет session_id, 401, 404, 409 отказ RPC |
| `POST` | `/api/simulations/restart` | Сессия | JSON: session_id | 400 нет session_id, 401, 404, 409 есть открытые сделки или конфликт |
| `GET` | `/api/market/candles?scenario_id=uptrend-basics` | Все | Query: scenario_id (обязателен) | 400 неизвестный сценарий |

## Примеры

### POST /api/auth/login

Проверяет пароль и устанавливает cookie.

```http
POST /api/auth/login HTTP/1.1
Content-Type: application/json

{"username":"edu","password":"123"}
```

```json
{
  "user": {
    "id": "<uuid>",
    "username": "edu",
    "role": "admin",
    "balance": 25000
  }
}
```

### POST /api/auth/logout

Удаляет текущую сессию при наличии cookie и очищает cookie.

```http
POST /api/auth/logout HTTP/1.1
```

```json
{
  "ok": true
}
```

### GET /api/auth/me

Возвращает текущего пользователя.

```http
GET /api/auth/me HTTP/1.1
```

```json
{
  "user": {
    "id": "<uuid>",
    "username": "edu",
    "role": "admin",
    "balance": 25000
  }
}
```

### GET /api/users

Список пользователей с датами создания и изменения.

```http
GET /api/users HTTP/1.1
```

```json
{
  "users": []
}
```

### POST /api/users

Создаёт пользователя. Успех 201.

```http
POST /api/users HTTP/1.1
Content-Type: application/json

{"username":"student","password":"example-password","role":"user","balance":5000}
```

```json
{
  "user": {
    "id": "<uuid>",
    "username": "student",
    "role": "user",
    "balance": 5000
  }
}
```

### PATCH /api/users/:id

Изменяет переданные поля учётной записи.

```http
PATCH /api/users/:id HTTP/1.1
Content-Type: application/json

{"balance":6000}
```

```json
{
  "user": {
    "id": "<uuid>",
    "username": "student",
    "role": "user",
    "balance": 6000
  }
}
```

### DELETE /api/users/:id

Удаляет учётную запись и связанные записи согласно FK.

```http
DELETE /api/users/:id HTTP/1.1
```

```json
{
  "ok": true
}
```

### GET /api/trades?scenario_id=uptrend-basics

Читает журнал. При переданном сценарии находит или создаёт активную сессию и возвращает её снимок. Без сценария журнал общий для пользователя, session_id и candles равны null.

```http
GET /api/trades?scenario_id=uptrend-basics HTTP/1.1
```

```json
{
  "trades": [],
  "session_id": "<uuid>",
  "candle_index": 0,
  "candles": [
    {
      "time": "09:00",
      "open": 42100,
      "high": 42380,
      "low": 41990,
      "close": 42240,
      "volume": 100
    }
  ],
  "market_source": "fallback",
  "balance": 25000
}
```

### POST /api/trades

Открывает сделку. Цену берёт сервер. Успех 201.

```http
POST /api/trades HTTP/1.1
Content-Type: application/json

{"session_id":"<uuid>","scenario_id":"uptrend-basics","side":"buy","quantity":0.05,"expected_candle_index":0,"stop_loss":41000}
```

```json
{
  "trade": {
    "id": "<uuid>",
    "status": "open"
  },
  "entry_price": 42240,
  "quantity": 0.05,
  "side": "buy",
  "balance": 22888
}
```

### POST /api/trades/:id/close

Закрывает свою открытую сделку по текущему закрытию свечи.

```http
POST /api/trades/:id/close HTTP/1.1
```

```json
{
  "trade": {
    "id": "<uuid>",
    "status": "closed",
    "exit_price": 42500,
    "realized_pnl": 13
  },
  "balance": 25013
}
```

### POST /api/simulations/advance

Шаг вперёд и обработка стопов в одном RPC.

```http
POST /api/simulations/advance HTTP/1.1
Content-Type: application/json

{"session_id":"<uuid>"}
```

```json
{
  "candle_index": 1,
  "candle": {
    "time": "09:15",
    "open": 42240,
    "high": 42600,
    "low": 42100,
    "close": 42500,
    "volume": 100
  },
  "advanced": true,
  "stopped_trades": [],
  "balance": 25000
}
```

### POST /api/simulations/restart

Создаёт новый цикл. Интерфейс предлагает его после завершения сценария.

```http
POST /api/simulations/restart HTTP/1.1
Content-Type: application/json

{"session_id":"<uuid>"}
```

```json
{
  "session_id": "<new-uuid>",
  "candle_index": 0,
  "candles": [
    {
      "time": "09:00",
      "open": 42100,
      "high": 42380,
      "low": 41990,
      "close": 42240,
      "volume": 100
    }
  ],
  "market_source": "fallback"
}
```

### GET /api/market/candles?scenario_id=uptrend-basics

Возвращает данные рынка без изменения сессии. as_of — время ответа.

```http
GET /api/market/candles?scenario_id=uptrend-basics HTTP/1.1
```

```json
{
  "candles": [
    {
      "time": "09:00",
      "open": 42100,
      "high": 42380,
      "low": 41990,
      "close": 42240,
      "volume": 100
    }
  ],
  "source": "fallback",
  "as_of": "2026-11-15T10:00:00.000Z"
}
```

## Известные ограничения

- Рыночный маршрут публичный, а `as_of` не показывает время последней котировки. [ТЗ 2C.3 и 2C.7](../TZ-FIX-BUGS.md)
- Для журнала и шага по свечам целевая задержка остаётся в работе. [ТЗ 2C.8](../TZ-FIX-BUGS.md)
