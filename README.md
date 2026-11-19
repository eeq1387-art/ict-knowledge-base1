# ระบบคู่มือและคลังความรู้ด้านเทคโนโลยีสารสนเทศ สำหรับศูนย์ ICT ขอนแก่น

เว็บไซต์รวมคู่มือและวิธีแก้ปัญหา IT สำหรับผู้ใช้ทั่วไป พร้อมพื้นที่เจ้าหน้าที่สำหรับดูแลบทความ หมวดหมู่ ช่องทางติดต่อ และสถิติการใช้งานเชิงลึก

## เทคโนโลยี

- **Frontend:** React 19, Vite 8, React Router 7, Axios
- **Backend:** Node.js, Express 5, Express Rate Limit, Helmet, Multer
- **Database:** PostgreSQL, Prisma ORM 7 (`@prisma/adapter-pg`)
- **Authentication:** bcrypt และ JWT (`HS256`, อายุเซสชัน 8 ชั่วโมง)

## สิ่งที่ต้องมี

- Node.js `20.19+` หรือ `22.12+` และ npm
- PostgreSQL ที่เข้าถึงได้จากเครื่องที่รัน backend
- ใช้ port `3000` สำหรับ API และ `5173` สำหรับ Vite dev server (หรือแก้ค่าตามต้องการใน environment)

## ติดตั้งและตั้งค่า

คัดลอกไฟล์ environment ตัวอย่างจาก root ของโปรเจกต์ แล้วใส่ค่าจริงใน `backend/.env`:

```powershell
Copy-Item backend/.env.example backend/.env
```

กำหนดตัวแปรต่อไปนี้ใน `backend/.env`:

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: ค่าสุ่มความยาวอย่างน้อย 32 ตัวอักษร (สร้างได้ด้วย `npm --prefix backend run secret:generate`)
- `ADMIN_INITIAL_USERNAME`, `ADMIN_INITIAL_FULLNAME`, `ADMIN_INITIAL_PASSWORD`: ข้อมูลบัญชีตั้งต้น; รหัสผ่านต้องยาว 12–200 ตัวอักษร
- `PORT` และ `FRONTEND_ORIGIN`: ไม่บังคับ (ค่าเริ่มต้นคือ port `3000` และ `http://localhost:5173`)
- `TRUST_PROXY`: ปล่อยว่างหากไม่ได้อยู่หลัง reverse proxy หรือระบุจำนวน hop / ค่าที่ Express รองรับ

> **ข้อควรระวัง:** ห้าม commit `backend/.env` หรือใส่รหัสผ่านจริงใน `.env.example`

จาก root ของโปรเจกต์ ติดตั้ง dependencies, รัน migration และเตรียมข้อมูลตั้งต้น:

```powershell
cd backend
npm install
npx prisma migrate deploy --config prisma7.config.ts
npx prisma generate --config prisma7.config.ts
npm run admin:create
npm run db:seed
```

เปิด Terminal สองหน้าต่างเพื่อรันระบบ:

```powershell
# Terminal 1 — จาก backend/
npm run dev
```

```powershell
# Terminal 2 — จาก frontend/
npm install
npm run dev
```

เปิดหน้าเว็บที่ `http://localhost:5173`; API อยู่ที่ `http://localhost:3000/api` และ health check คือ `/api/health`

## คำสั่งดูแลระบบและทดสอบ (`backend`)

- `npm run db:seed` — เติมข้อมูลมาตรฐาน (5 หมวดหมู่, 20 บทความครอบคลุมทุกหมวดพร้อมภาพอินโฟกราฟิกและ PDF A4, ผลโหวต, ข้อมูลติดต่อศูนย์ ICT, ยอดเข้าชมรายวันย้อนหลัง 30 วัน และประวัติคำค้นจำลอง) แบบ idempotent (รองรับ `--keep-stats` เพื่อรักษาสถิติเดิม และ `--zero-stats` เพื่อเริ่มนับสถิติจาก 0)
- `npm run stats:reset` — รีเซ็ตสถิติยอดเข้าชม ผลโหวต และประวัติคำค้นหาให้เริ่มนับจากศูนย์
- `npm run logs:prune` — ลบประวัติคำค้น (`SearchLog`) ที่เก่ากว่า 90 วัน
- `npm test` — รันชุดทดสอบอัตโนมัติ (API สาธารณะ, ค้นหา, ล็อกอิน/Rate Limit, เปลี่ยน/รีเซ็ตรหัสผ่าน, ข้อมูลติดต่อ, สถิติ/บอท/โหมดดูตัวอย่าง, รายงานสรุปประจำเดือน JSON/CSV, ระบบกรองและลบคำค้นหยาบคาย, โหวตความพึงพอใจ และการอัปโหลดแกลเลอรีรูปภาพ 1–5 รูปพร้อมตรวจสอบ Magic Bytes) โดยคืนค่าฐานข้อมูลกลับสู่สภาพเดิมหลังจบการทดสอบ

## ฟังก์ชันหลัก

- **ผู้ใช้ทั่วไป:**
  - หน้าแรก, หมวดหมู่ความรู้ 5 หมวดหมู่, ค้นหาคู่มือ (รองรับทั้งพิมพ์ติดกันและมีขีดกลาง เช่น `wifi` / `Wi-Fi`), กรอง/เรียงลำดับ/แบ่งหน้า
  - หน้าอ่านบทความ: แสดงภาพปกและแกลเลอรีรูปภาพประกอบเต็มสัดส่วนไม่ถูกครอป (`object-fit: contain`) พร้อม Lightbox ขยายเต็มจอและเลื่อนดูภาพก่อนหน้า/ถัดไป
  - ปุ่มแชร์คู่มือไปยัง **LINE** และ **Facebook** พร้อมปุ่มคัดลอกลิงก์ พิมพ์คู่มือ และดาวน์โหลดไฟล์ PDF A4
  - ประเมินความพึงพอใจบทความ และดูช่องทางติดต่อศูนย์พัฒนาทักษะและการเรียนรู้ ICT เทศบาลนครขอนแก่น (พร้อมโลโก้คู่เทศบาลนครขอนแก่น `/logo-kkmuni.svg` และโลโก้ศูนย์ ICT `/logo-kkict.svg`)
- **เจ้าหน้าที่ (Admin):**
  - เข้าสู่ระบบพร้อมการจำกัดอัตราป้องกันการเดารหัสผ่าน (10 ครั้ง/15 นาที/บัญชี และ 30 ครั้ง/15 นาที/IP) และระบบตั้งรหัสผ่านใหม่
  - Dashboard ภาพรวม, **รายงานสรุปผลงานประจำเดือน (Monthly Report)** พร้อมตัวเลือกเดือน/ปี ตารางบทความประจำเดือนแบบแบ่งหน้า และปุ่มส่งออก **Export Monthly CSV**
  - กราฟยอดเข้าชมรายวันย้อนหลัง `7 / 30 / 90` วัน, ตารางคำค้นยอดนิยม และรายการคำค้นที่หาไม่เจอพร้อมปุ่มลัดเขียนคู่มือใหม่ ระบบกรองคำหยาบอัตโนมัติ และปุ่มลบ/บล็อกคำค้นหาที่ไม่เหมาะสม
  - จัดการบทความและหมวดหมู่ (CRUD), สลับสถานะ `DRAFT` / `PUBLISHED` / `HIDDEN`, ดูตัวอย่างบทความ (`?preview=1`) โดยไม่เพิ่มยอดวิว และส่งออกรายงานสถิติเป็นไฟล์ CSV
  - ตั้งค่าข้อมูลติดต่อ 7 ช่อง (`phone`, `lineId`, `lineUrl`, `email`, `location`, `hours`, `note`) พร้อมตรวจสอบความถูกต้องของอีเมลและลิงก์ `https://`
  - อัปโหลดรูปภาพประกอบได้ **1 ถึง 5 รูปต่อบทความ** (`JPG / PNG / WebP` ไม่เกินรูปละ 5 MB, เลือกตั้งภาพปกหรือลบรูปแยกแต่ละรูปได้) และไฟล์คู่มือ (`PDF` ไม่เกิน 15 MB) พร้อมตรวจสอบทั้งนามสกุล, MIME type และ Magic Bytes (File Signature)

## API หลัก

- **Public:** `GET /api/categories`, `GET /api/articles`, `GET /api/articles/search`, `GET /api/articles/:id`, `POST /api/articles/:id/feedback`, `GET /api/settings/contact`
- **Auth:** `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`, `PUT /api/auth/password`, `POST /api/auth/reset-password`
- **Admin:** `GET /api/admin/dashboard`, `GET /api/admin/insights`, `GET /api/admin/reports/monthly`, `GET /api/admin/reports/monthly.csv`, `GET /api/admin/reports/articles.csv`, `DELETE /api/admin/search-logs`, `PUT /api/admin/settings/contact`, `/api/admin/articles`, `/api/admin/categories`

## เอกสารผลการตรวจสอบ

ดูตารางผลการตรวจสอบและหลักฐานการทดสอบฉบับเต็มได้ที่ [docs/VERIFICATION.md](./docs/VERIFICATION.md)
