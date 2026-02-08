# Snack Tracker

ระบบจัดการขายขนม พร้อมรายงานรายเดือน, กำไร, สิทธิ์ผู้ใช้ (admin/staff), audit log, และ backup

## โครงสร้างหลัก

- `pro.html` หน้า UI
- `assets/css/main.css` สไตล์
- `assets/js/modules/core.js` ระบบหลัก + login/state sync
- `assets/js/modules/report.js` รายงานรายเดือน/คิดเงินลูกค้า/ส่งออกไฟล์
- `assets/js/modules/manage.js` จัดการสินค้า-ลูกค้า-กำไร + audit view
- `assets/js/modules/bootstrap.js` bind event เริ่มระบบ
- `server.js` API + Neon/Postgres + validation + backup/report endpoints

## เริ่มต้นใช้งาน

1. ติดตั้ง dependencies
- `npm install`

2. ตั้งค่า `.env`
- คัดลอกจาก `.env.example`
- ถ้ามี `DATABASE_URL` จะใช้ Postgres
- ถ้าไม่มี `DATABASE_URL` ระบบจะใช้ memory mode (เหมาะสำหรับทดลอง/ทดสอบ)

3. รันเซิร์ฟเวอร์
- `npm start`
- เปิด `http://localhost:3000`

## สิทธิ์ผู้ใช้

- ผู้ใช้แรกของระบบจะเป็น `admin`
- ผู้ใช้ใหม่ถัดไปจะเป็น `staff`
- `admin` เท่านั้นที่เข้าหน้าจัดการข้อมูลได้
- ในแท็บลูกค้า มีส่วนจัดการสิทธิ์ผู้ใช้ (เลื่อนเป็น Admin / ลดสิทธิ์)

## API สำคัญ

- `GET /api/health` สถานะระบบ + โหมดทำงาน + uptime
- `GET /api/state` อ่าน state
- `PUT /api/state` เขียน state (มี validation ฝั่ง server)
- `GET /api/report/monthly?month=YYYY-MM` รายงานสรุปรายเดือน
- `GET /api/audit?limit=100` audit log
- `GET /api/backup` สร้าง backup ทันที
- `GET /api/report/monthly?month=YYYY-MM` รวมยอดคิดเงินลูกค้า + กำไรรายเดือน

## Backup อัตโนมัติ

ตั้งค่าใน `.env`
- `BACKUP_DIR=./backups`
- `BACKUP_INTERVAL_MIN=30`

ระบบจะเขียนไฟล์ JSON snapshot ตามรอบเวลา

## ทดสอบ

- รันทั้งหมด: `npm test`
- เทสต์จะครอบคลุม flow หลัก:
  - เขียน state (เพิ่มสินค้า/ลูกค้า/การขาย)
  - อ่าน state
  - เรียกรายงานรายเดือน

## หมายเหตุ Deploy

- สำหรับ production ควรตั้ง `DATABASE_URL` และเปิด backup อัตโนมัติ
- ถ้า deploy บน Cloudflare/VM ให้ตรวจ env vars และ route API ให้ถูกต้อง
