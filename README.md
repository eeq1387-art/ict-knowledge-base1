# ระบบคู่มือและคลังความรู้ด้านเทคโนโลยีสารสนเทศ สำหรับศูนย์ ICT ขอนแก่น

เว็บไซต์รวมคู่มือและวิธีแก้ปัญหา IT สำหรับผู้ใช้ทั่วไป พร้อมพื้นที่เจ้าหน้าที่สำหรับดูแลบทความและหมวดหมู่

## เทคโนโลยี

- Frontend: React 19, Vite 8, React Router, Axios, Bootstrap 5
- Backend: Node.js, Express 5
- Database: PostgreSQL, Prisma ORM 7, Prisma PostgreSQL adapter
- Authentication: bcrypt และ JWT

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
- `JWT_SECRET`: ค่าสุ่มยาวอย่างน้อย 32 ตัวอักษร
- `ADMIN_INITIAL_USERNAME`, `ADMIN_INITIAL_FULLNAME`, `ADMIN_INITIAL_PASSWORD`: ข้อมูลบัญชีตั้งต้น; รหัสผ่านต้องยาว 12–200 ตัวอักษร
- `PORT` และ `FRONTEND_ORIGIN`: ไม่บังคับ หากใช้ค่าเริ่มต้นให้ API อยู่ port 3000 และ frontend origin `http://localhost:5173`

อย่า commit `backend/.env` หรือใส่รหัสผ่านจริงใน `.env.example` บัญชี Admin ใช้ค่าที่ตั้งใน environment เท่านั้น ไม่มีรหัสผ่านที่ฝังไว้ในโค้ดหรือ README

จาก root ของโปรเจกต์ ติดตั้ง dependencies และเตรียมฐานข้อมูล:

```powershell
cd backend
npm install
npx prisma migrate deploy
npx prisma generate
npm run admin:create
```

คำสั่งสร้าง Admin ใช้ครั้งแรกต่อ username เท่านั้น หากบัญชีนั้นมีอยู่แล้ว Prisma จะปฏิเสธ username ซ้ำ

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

## ฟังก์ชัน

- ผู้ใช้ทั่วไป: หน้าแรก, หมวดหมู่, ค้นหา/กรอง/เรียง/แบ่งหน้า, รายละเอียดบทความ, ดาวน์โหลด PDF และ feedback
- เจ้าหน้าที่: login/logout, dashboard, CRUD บทความและหมวดหมู่, เปลี่ยนสถานะ draft/published/hidden, อัปโหลดภาพและ PDF
- Upload: JPG/PNG/WebP ไม่เกิน 5 MB และ PDF ไม่เกิน 15 MB; ตรวจ MIME, นามสกุล และ file signature ก่อนบันทึก
- ป้องกันลบหมวดหมู่ที่มีบทความ และป้องกัน feedback ซ้ำต่อ article/voter key

## API หลัก

- Public: `GET /api/categories`, `GET /api/articles`, `GET /api/articles/search`, `GET /api/articles/:id`, `POST /api/articles/:id/feedback`
- Auth: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- Admin: `GET /api/admin/dashboard`, `/api/admin/articles`, `/api/admin/categories` และเส้นทาง CRUD ตาม resource (ทุกเส้นทาง Admin ต้องมี JWT ยกเว้น login)

## ตรวจสอบ

รายการตรวจรอบหลักที่ผ่าน:

- `frontend`: `npm run build` และ `npm run lint`
- `backend`: Node syntax check, `npx prisma validate`, migration status
- PostgreSQL smoke checks: auth, category/article CRUD, dashboard aggregates, search relevance/filter/pagination, publish/hide visibility, upload/static serving, file signature rejection และการป้องกันลบหมวดหมู่ที่มีบทความ
- ข้อมูลและไฟล์ทดสอบถูกลบหลังการตรวจ

Migration schema อยู่ที่ `backend/prisma/migrations/`; migration ปัจจุบันถูก apply และฐานข้อมูลที่ตั้งค่าไว้รายงานว่า schema up to date

## สถานะ Phase

- Phase 1: โครงสร้างและฐานข้อมูล — เสร็จ
- Phase 2: เว็บไซต์ผู้ใช้ — เสร็จ
- Phase 3: Authentication — เสร็จและ smoke test ผ่าน
- Phase 4: CRUD บทความ/หมวดหมู่ — เสร็จและ smoke test ผ่าน
- Phase 5: ค้นหาและ Dashboard — เสร็จและ smoke test ผ่าน
- Phase 6: ตรวจ build/lint, schema/migrations และ API smoke checks — ผ่านรอบหลัก
