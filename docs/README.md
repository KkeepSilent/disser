# Документация TradeMind Education

TradeMind Education — учебный симулятор с виртуальным балансом, пошаговым рынком и журналом сделок.

## Оглавление

- [Документы](#документы)
- [Карта проекта](#карта-проекта)
- [Известные ограничения](#известные-ограничения)

## Документы

| Документ | Содержание |
|---|---|
| [README](README.md) | Карта проекта |
| [getting-started](getting-started.md) | Установка, env, Supabase и запуск |
| [architecture](architecture.md) | Слои, файлы и потоки запросов |
| [database](database.md) | Таблицы, RPC и миграции |
| [api](api.md) | HTTP-методы и примеры |
| [auth](auth.md) | Вход, сессии и роли |
| [market-data](market-data.md) | Binance, кэш и снимки |
| [simulator](simulator.md) | Сценарии, сделки и наставник |
| [chart](chart.md) | Свечи, объём, оси и стопы |
| [deployment](deployment.md) | Сборка и развёртывание |
| [troubleshooting](troubleshooting.md) | Диагностика сбоев |
| [glossary](glossary.md) | Термины |
| [roadmap](roadmap.md) | План до мая 2027 |

## Карта проекта

~~~mermaid
flowchart LR
    A["src/app: страницы и API"] --> B["src/components: интерфейс"]
    A --> C["src/lib/server: авторизация и данные"]
    B --> D["src/lib: модели и правила"]
    B --> E["src/data: сценарии и уроки"]
    C --> F["Supabase: таблицы и RPC"]
~~~

## Известные ограничения

Состояние открытых работ описано в [roadmap](roadmap.md) и [ТЗ](../TZ-FIX-BUGS.md).
