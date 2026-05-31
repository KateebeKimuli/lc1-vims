<div align="center">

# 🏛️ LC1 Village Information Management System

**LC1 VIMS** — A comprehensive offline-first digital governance platform for Uganda's Local Council 1 village authorities.

[![Ministry of Local Government](https://img.shields.io/badge/Ministry-Local%20Government%20Uganda-006400?style=for-the-badge)](https://molg.go.ug)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)](https://reactjs.org)
[![PWA](https://img.shields.io/badge/PWA-Offline%20First-5A0FC8?style=for-the-badge)](https://web.dev/progressive-web-apps/)
[![Supabase](https://img.shields.io/badge/Supabase-Cloud%20Sync-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

*Submitted to the MoICT&NG Government Systems Prototype Showcase*

</div>

---

## 📋 Overview

LC1 VIMS digitises every core responsibility of Uganda's 60,000+ Local Council 1 village councils — from resident registration and land titling to civil registration, official letters, case management, and government analytics. It works **fully offline**, syncs automatically to the cloud when connectivity is available, and requires no specialist IT skills to operate.

---

## ✨ Features

| Module | Description |
|--------|-------------|
| 👤 **Residents** | Full biodata registration with photo + fingerprint biometrics, cross-village NIN duplicate detection, affiliated resident support |
| 📐 **Land Records** | Auto-generated plot numbers, feet-based sketch maps, village land title PDF issuance |
| 👶 **Births** | Civil registration, birth certificate generation, SMS notification |
| 📋 **Deaths** | Death registration, deceased identity permanent lock (prevents NIN reuse) |
| ⚖️ **Cases** | Dispute management, case report PDF, hearing tracking |
| 📄 **Letters** | Official letters and certificates on MoLG letterhead |
| 🗣️ **Meetings** | Meeting minutes, attendance, bulk SMS notifications |
| 🤝 **Welfare / PDM** | PDM beneficiary tracking, eligibility auto-report |
| 🏪 **Businesses** | Business registration and licensing |
| 🛡️ **Security** | Incident logging and escalation |
| 📊 **Reports** | Live charts, age pyramid, data sieve filters, PDF exports |

---

## 🔒 Security Architecture

- **Password hashing**: PBKDF2-SHA256, 310,000 iterations (OWASP 2023)
- **Encryption at rest**: AES-256-GCM via Web Crypto API
- **Session management**: 15-min inactivity timeout, 5-fail account lockout
- **Tamper-evident audit log**: SHA-256 chained hash per entry
- **Village isolation**: each village in a separate IndexedDB instance
- **Deceased identity lock**: NIN + name+DOB permanently blocked after death
- **RBAC**: 11 roles enforced at the database write layer

---

## 🗄️ Database Structure

```
Local (IndexedDB — browser-native, offline):
  lc1-master          → village registry, system admin
  lc1-village-{id}    → per-village: residents, land, cases,
                        births, deaths, meetings, letters,
                        welfare, businesses, security, audit

Cloud (Supabase / PostgreSQL — optional sync):
  lc1_residents, lc1_land, lc1_cases, lc1_births,
  lc1_deaths, lc1_meetings, lc1_letters, lc1_welfare,
  lc1_businesses, lc1_security, lc1_users, lc1_audit,
  lc1_settings, lc1_households, lc1_villages
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm 9+

### Install and run

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/lc1-vims.git
cd lc1-vims

# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:5173` in Chrome or Edge.

### Build for production

```bash
npm run build
# Output in /dist — deploy to any static host
```

### SMS proxy server (optional — for SMS notifications)

```bash
cd server
npm install
cp .env.example .env
# Edit .env with your Africa's Talking credentials
npm start
```

---

## ☁️ Cloud Database Setup (Supabase)

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the setup script:
   ```
   database/LC1_VIMS_Supabase_Setup.sql
   ```
3. Copy your **Project URL** and **anon key** from Settings → API
4. In LC1 VIMS: **Settings → ☁️ Sync & Backup → Supabase Cloud Database**
5. Paste credentials, test connection, enable sync

---

## 🔑 Default Login Credentials

> ⚠️ Change these immediately after first login in Settings → Committee

| Role | Username | Password |
|------|----------|----------|
| System Administrator | `sysadmin` | `MoLG@Uganda2024` |
| Village Chairperson | `admin` | `lc1admin2024` |

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5 |
| Language | JavaScript ES2022 |
| Local DB | IndexedDB (idb v8) |
| Cloud DB | Supabase (PostgreSQL) |
| Crypto | Web Crypto API (browser-native) |
| PDF | jsPDF + jsPDF-AutoTable |
| PWA | vite-plugin-pwa + Workbox |
| SMS | Africa's Talking (Node.js proxy) |
| Charts | Custom SVG (zero dependencies) |

---

## 📁 Project Structure

```
lc1-vims/
├── src/
│   ├── assets/          — Logo and static assets
│   ├── components/      — Shared UI components
│   │   ├── charts/      — SVG chart components
│   │   ├── land/        — Sketch map component
│   │   ├── layout/      — Sidebar and layout
│   │   └── shared/      — Buttons, modals, identity card
│   ├── data/            — Uganda locations, roles, permissions
│   ├── db/              — IndexedDB layer (offline-first)
│   ├── hooks/           — useAuth, useSyncStatus
│   ├── pages/           — All 18 application pages
│   ├── security/        — Crypto, session, RBAC
│   └── services/        — PDF generation, cloud sync, SMS
├── server/              — Node.js SMS proxy
├── database/            — Supabase SQL setup script
└── public/              — Icons, manifest
```

---

## 📜 Legal

Built for Uganda's LC1 village governance structure under the **Local Governments Act, Cap. 243** and the **Land Act, Cap. 227**.

Land titles issued by the system reference customary ownership certificates as recognised under Ugandan law.

---

## 🙏 Acknowledgements

- Ministry of Local Government, Republic of Uganda
- MoICT&NG Government Systems Prototype Showcase
- Africa's Talking — SMS infrastructure

---

<div align="center">
<strong>Ministry of Local Government · Republic of Uganda</strong><br/>
<em>Submitted to MoICT&NG Government Systems Prototype Showcase</em>
</div>
