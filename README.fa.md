# HUSH - مخزن چت رمزنگاری‌شده با معماری Zero-Knowledge

[![GitHub Stars](https://img.shields.io/github/stars/thefeshin/hush?style=for-the-badge)](https://github.com/thefeshin/hush/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/thefeshin/hush?style=for-the-badge)](https://github.com/thefeshin/hush/network/members)
[![License](https://img.shields.io/github/license/thefeshin/hush?style=for-the-badge)](https://github.com/thefeshin/hush/blob/main/LICENSE)

![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-009639?style=for-the-badge&logo=nginx&logoColor=white)

[English](README.md) | فارسی | [Roadmap](TODO.md) | [License](LICENSE)

HUSH یک پیام‌رسان خصوصی Self-Hosted است که روی رمزنگاری سمت کلاینت و حداقل‌سازی اعتماد به سرور تمرکز دارد.
سرور فقط payloadهای رمز‌شده را رله می‌کند و تنها متادیتای لازم برای مسیردهی، کشف گفتگو و مدیریت نشست را نگه می‌دارد.

## HUSH چه امکاناتی می‌دهد؟

- جریان رمزنگاری انتها-به-انتها در کلاینت (Argon2id + HKDF + AES-GCM)
- احراز هویت مبتنی بر Cookie با گردش Refresh Token
- پیام‌رسانی بلادرنگ با WebSocket و صف آفلاین
- فرانت PWA و استقرار Docker-first
- اسکریپت‌های استقرار آفلاین/Air-Gapped

## وضعیت فعلی پروژه

برای این مخزن یک برنامه‌ی سخت‌گیرانه‌ی امنیتی و ریفکتور تعریف شده است.  
جزئیات کامل در `TODO.md` آمده است.

فاز P0 در **۱۰ فوریه ۲۰۲۶** تکمیل شده است:
- کنترل دسترسی مبتنی بر عضویت گفتگو برای مسیرهای REST و WebSocket اعمال شد،
- مسیر `subscribe_user` دیگر به `user_id` ارسالی کلاینت اعتماد نمی‌کند،
- احراز هویت WebSocket با query token حذف شد (فقط cookie)،
- نگهداری raw vault key در `sessionStorage` حذف و به حافظه‌ی runtime محدود شد.

تغییرات ناسازگار با کلاینت‌های قدیمی:
- اتصال `WebSocket` با `?token=...` دیگر پشتیبانی نمی‌شود.
- payload جدید `subscribe_user` به شکل `{"type":"subscribe_user"}` است.

## ساختار مخزن

- `backend/`: API و WebSocket (FastAPI)
- `frontend/`: کلاینت React + TypeScript + PWA
- `cli/`: راه‌انداز و تولید secret
- `offline/`: ساخت bundle و استقرار آفلاین
- `nginx/`: پروکسی و TLS
- `TODO.md`: نقشه‌ی راه اصلاحات

## پیش‌نیازها

- Docker و Docker Compose
- Python 3
- Node.js و npm (برای توسعه محلی فرانت)
- OpenSSL

## استقرار آنلاین (ماشین متصل به اینترنت)

### روش پیشنهادی (تعامل‌محور)

Linux/macOS:
```bash
chmod +x ./hush.sh
./hush.sh
```

Windows PowerShell:
```powershell
.\hush.ps1
```

در منو، حالت Docker را انتخاب کنید.  
دسترسی: `https://localhost`

### روش دستی Docker

```bash
docker compose build
docker compose up -d
docker compose ps
```

## توسعه محلی (بدون استک کامل Docker)

1. اجرای PostgreSQL:
```bash
docker run -d --name hush-postgres -e POSTGRES_USER=hush -e POSTGRES_PASSWORD=hush -e POSTGRES_DB=hush -p 5432:5432 postgres:16-alpine
```

2. اجرای backend:
```bash
cd backend
python -m venv venv
# ویندوز: .\venv\Scripts\Activate.ps1
# لینوکس/مک: source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

تست‌های backend (اختیاری):
```bash
pip install -r requirements-dev.txt
pytest -q
```

3. اجرای frontend:
```bash
cd frontend
npm install
npm run dev
```

فرانت روی `http://localhost:3000` بالا می‌آید.

## استقرار آفلاین (Air-Gapped)

### روی ماشین دارای اینترنت

Linux/macOS:
```bash
./offline/build-bundle.sh
```

Windows:
```powershell
.\offline\build-bundle.ps1
```

خروجی اصلی: `offline/hush-offline-bundle.tar` به همراه `.env`

### انتقال به ماشین آفلاین

فایل‌ها/پوشه‌های زیر را منتقل کنید:
- `offline/hush-offline-bundle.tar`
- `docker-compose.yml`
- `nginx/`
- `offline/deploy-offline.sh` یا `offline/deploy-offline.ps1`
- `.env` (در صورت استفاده از همان تنظیمات)

### اجرای استقرار روی ماشین آفلاین

Linux/macOS:
```bash
./offline/deploy-offline.sh
```

Windows:
```powershell
.\offline\deploy-offline.ps1
```

### نکته مهم (تا قبل از اصلاح اسکریپت‌ها)

اسکریپت‌های آفلاین فعلا مقدار `FAILURE_MODE=block` می‌نویسند؛  
در backend این مقدار پشتیبانی نمی‌شود. مقادیر معتبر:
- `ip_temp`
- `ip_perm`
- `db_wipe`
- `db_wipe_shutdown`

قبل از استفاده عملی، مقدار `.env` را به یکی از مقادیر معتبر (مثلا `ip_temp`) تغییر دهید.

## عملیات روزمره

```bash
docker compose logs -f
docker compose ps
docker compose restart backend
docker compose down -v
```

## گام‌های بعدی (مطابق `TODO.md`)

1. اصلاح اسکریپت‌های آفلاین برای مقدارهای معتبر `FAILURE_MODE` و fail-fast برای secretهای ضروری backend.
2. اصلاح mismatch مسیر fallback پیام‌ها در REST و به‌روزرسانی متن‌های کاربری گمراه‌کننده.
3. یکپارچه‌سازی storeها/لایه WebSocket در frontend و توسعه بیشتر تست‌های امنیتی.

## زبان و مجوز

- نسخه انگلیسی: `README.md`
- مجوز: MIT (`LICENSE`)
