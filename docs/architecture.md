# Архитектура

Next.js App Router объединяет серверные и клиентские части TradeMind Education.

## Оглавление

- [Слои](#слои)
- [Открытие сделки](#открытие-сделки)
- [Шаг по свечам](#шаг-по-свечам)
- [Файлы](#файлы)
- [Известные ограничения](#известные-ограничения)

## Слои

Браузер вызывает Route Handlers. Обработчики проверяют сессию приложения и обращаются к Supabase Data API серверным клиентом. Таблицы закрыты правилами RLS и привилегиями Postgres. [Схема доступа](database.md).

## Открытие сделки

~~~mermaid
sequenceDiagram
    participant B as Симулятор
    participant N as Next.js API
    participant D as Supabase
    B->>N: POST /api/trades с индексом свечи
    N->>D: Сессия пользователя и снимок
    N->>D: place_trade с ценой снимка
    D-->>N: Записанная сделка
    N->>D: Запрос текущего баланса
    N-->>B: Сделка и баланс
~~~

## Шаг по свечам

~~~mermaid
flowchart LR
    A["Следующая свеча"] --> B["POST /api/simulations/advance"]
    B --> C["Проверка сессии"]
    C --> D["RPC: индекс, стопы, баланс"]
    D --> E["Обновление графика и журнала"]
~~~

## Файлы

| Файл | Ответственность |
|---|---|
| [src/app/page.tsx](../src/app/page.tsx) | Выбирает форму входа или приложение по серверной сессии. |
| [src/app/layout.tsx](../src/app/layout.tsx) | Корневая разметка, язык и metadata. |
| [src/app/globals.css](../src/app/globals.css) | Глобальные стили и Tailwind. |
| [src/app/error.tsx](../src/app/error.tsx) | Граница ошибок страницы с кнопкой повторной попытки. |
| [src/app/not-found.tsx](../src/app/not-found.tsx) | Экран 404. |
| [src/app/robots.ts](../src/app/robots.ts) | Правила для поисковых роботов. |
| [src/app/icon.svg](../src/app/icon.svg) | Иконка сайта. |
| [src/app/api/auth/login/route.ts](../src/app/api/auth/login/route.ts) | Вход и создание сессии. |
| [src/app/api/auth/logout/route.ts](../src/app/api/auth/logout/route.ts) | Выход и удаление сессии. |
| [src/app/api/auth/me/route.ts](../src/app/api/auth/me/route.ts) | Текущий пользователь. |
| [src/app/api/users/route.ts](../src/app/api/users/route.ts) | Список и создание пользователей. |
| [src/app/api/users/[id]/route.ts](../src/app/api/users/%5Bid%5D/route.ts) | Изменение и удаление пользователя. |
| [src/app/api/trades/route.ts](../src/app/api/trades/route.ts) | Журнал, создание сессии сценария и открытие сделки. |
| [src/app/api/trades/[id]/close/route.ts](../src/app/api/trades/%5Bid%5D/close/route.ts) | Ручное закрытие сделки. |
| [src/app/api/simulations/advance/route.ts](../src/app/api/simulations/advance/route.ts) | Переход на свечу и исполнение стопов. |
| [src/app/api/simulations/restart/route.ts](../src/app/api/simulations/restart/route.ts) | Новый цикл с новым снимком. |
| [src/app/api/market/candles/route.ts](../src/app/api/market/candles/route.ts) | Публичная выдача свечей. |
| [src/components/LoginForm.tsx](../src/components/LoginForm.tsx) | Форма входа и ошибки. |
| [src/components/TradeApp.tsx](../src/components/TradeApp.tsx) | Оболочка, баланс, выход, наставник и админка. |
| [src/components/UserManagement.tsx](../src/components/UserManagement.tsx) | Формы управления пользователями. |
| [src/components/Simulator.tsx](../src/components/Simulator.tsx) | Сценарии, свечи, сделки и журнал. |
| [src/components/MentorPanel.tsx](../src/components/MentorPanel.tsx) | Карточки обратной связи и шкала риска. |
| [src/components/LessonList.tsx](../src/components/LessonList.tsx) | Карточки и статусы уроков. |
| [src/data/scenarios.ts](../src/data/scenarios.ts) | Сценарии и резервные свечи. |
| [src/data/lessons.ts](../src/data/lessons.ts) | Данные учебного маршрута. |
| [src/lib/mentor.ts](../src/lib/mentor.ts) | Проверки риска и дисциплины. |
| [src/lib/types.ts](../src/lib/types.ts) | Общие модели данных. |
| [src/lib/server/auth.ts](../src/lib/server/auth.ts) | Сессии, cookie, роли и обработка API-ошибок. |
| [src/lib/server/supabase-admin.ts](../src/lib/server/supabase-admin.ts) | Серверный клиент с привилегированным ключом. |
| [src/lib/server/market-data.ts](../src/lib/server/market-data.ts) | HTTP-загрузка, кэш и разбор снимка. |

## Известные ограничения

Переход на свечу сводит запись к одному RPC. Чтение журнала всё ещё состоит из нескольких запросов к базе. [ТЗ 2C.8](../TZ-FIX-BUGS.md)
