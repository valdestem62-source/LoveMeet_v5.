# LoveMeet v5 (Render-ready)

- Сервер: Express + Socket.IO (сигналинг WebRTC)
- Клиент: видеочат (камера/мик), чат, «Следующий», RU/EN, админка с вкладками.
- Оплаты: Kaspi + WebMoney (автоподстановка реквизитов, редирект на платёжную страницу).
- Админ код по умолчанию: **supersecret123** (можно поменять переменной `ADMIN_CODE` на Render).

## Быстрый деплой на Render
1. Создайте новый Web Service из GitHub (или «Public Git repo»).
2. В `render.yaml` уже прописаны `buildCommand` и `startCommand`.
3. В Variables добавьте `ADMIN_CODE=supersecret123` (или свой).
4. При необходимости заполните MerchantID Kaspi и кошелёк WebMoney в `server/settings.json` или в админке (вкладка «Платежи»).

## Запуск локально
```bash
npm i
npm start
# http://localhost:3000
