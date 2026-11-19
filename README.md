# WhileFly — FPV-помічник (React Native / Expo)

| Вкладка | Що робить |
|---|---|
| **Логи** | Відкриває Blackbox лог Betaflight (`.bbl/.bfl/.txt`) і декодує бінарний формат прямо на телефоні: тривалість, батарея (просідання, мА·год), газ, навантаження моторів, гіро, GPS, RSSI, режими/дізарми, PID/rates/фільтри, автоматичні висновки й графіки. Кілька польотів в одному файлі. |
| **Телеметрія** | Живі дані з ELRS Backpack: LQ, RSSI, SNR, TX power, батарея, GPS, штучний горизонт, режим польоту, графіки й попередження. CRSF і MAVLink. Транспорти: Демо, WebSocket, UDP. |
| **Погода** | В розробці. |
| **Акаунт** | Тег (позивний), вхід / реєстрація, вибір мови (українська / English). |

## Запуск програми

```bash
npm install
npx expo start
```

Відскануй QR в **Expo Go**. UDP-телеметрія потребує dev build (`npx expo run:android`).

Адреса сервера — у `.env` (див. `.env.example`) або в полі «Сервер» на екрані входу.

## Сервер (акаунти)

Папка `server/` — Node.js (≥ 23.6) без фреймворків: реєстрація, вхід, вихід, `GET /me`.
База — вбудований SQLite (`server/data/whilefly.db`, не в git), паролі — scrypt.

```bash
cd server
npm install
npm start        # порт 4000
npm test         # наскрізні перевірки API
```

## APK

```bash
npx eas-cli@latest build -p android --profile preview
```

Адреса сервера для збірки — `EXPO_PUBLIC_API_URL` у `eas.json`.

## Структура

```
App.tsx                  навігація (4 вкладки)
src/blackbox/            декодер Blackbox + аналітика
src/telemetry/           CRSF, MAVLink, транспорти, симулятор
src/i18n/                переклади (ключі — українські рядки)
src/state/AuthContext    вхід / сесія
src/screens/             екрани
server/                  сервер акаунтів
```
