# LC1 Village Information Management System
### Ministry of Local Government — Republic of Uganda

---

## What is in this folder

```
lc1-vims-v2/
├── src/              ← The web application (React)
├── server/           ← The SMS proxy server (Node.js)
│   ├── smsProxy.js   ← The proxy server code
│   ├── .env.example  ← Template for your credentials
│   └── package.json
├── index.html
├── package.json
└── vite.config.js
```

---

## Part 1 — Run the web application

### Requirements
- Node.js version 18 or newer (download from nodejs.org)

### Steps
```bash
# 1. Open a terminal in the lc1-vims-v2 folder
cd lc1-vims-v2

# 2. Install dependencies (first time only)
npm install

# 3. Start the development server
npm run dev

# 4. Open your browser and go to:
#    http://localhost:5173

# 5. Default login: admin / lc1admin2024
#    (Change this immediately in Settings → Users)
```

### Build for production (to deploy on a server)
```bash
npm run build
# This creates a dist/ folder you can deploy to any web server
```

---

## Part 2 — Set up SMS notifications

SMS is sent via Africa's Talking (africastalking.com).
You need an account there first — sign up free at africastalking.com.

### Step 1 — Create your credentials file

1. Go into the `server/` folder
2. Find the file called `.env.example`
3. Make a **copy** of it and name the copy exactly: `.env`
   - On Windows: right-click → Copy → Paste → rename to `.env`
   - On Linux/Mac: `cp .env.example .env`
4. Open `.env` in any text editor (Notepad is fine)
5. Fill in your details:

```
AT_USERNAME=your_africastalking_username
AT_API_KEY=your_africastalking_api_key
PORT=3001
AT_SENDER_ID=MOLG-LC1
```

**Where to find these:**
- Log in at account.africastalking.com
- Your username appears in the top-left of the dashboard
- API Key: go to Settings → API Key → click Generate

### Step 2 — Install and start the proxy

Open a **second terminal** (keep the web app terminal running separately):

```bash
# Go into the server folder
cd lc1-vims-v2/server

# Install dependencies (first time only)
npm install

# Start the proxy server
npm start
```

You should see:
```
✓  LC1 VIMS SMS Proxy is running
   Health check : http://localhost:3001/health
   SMS endpoint : http://localhost:3001/sms
```

### Step 3 — Connect the app to the proxy

1. Open the LC1 app in your browser
2. Go to **Settings → Integrations**
3. Scroll to **SMS Notifications**
4. In the **SMS Proxy URL** field, enter:
   ```
   http://localhost:3001/sms
   ```
5. Enter your AT Username, API Key, and Sender ID in the fields
6. Click **Save SMS settings**
7. Enter a phone number and click **Send test SMS**

---

## Part 3 — Keep the proxy running automatically (optional)

So the proxy restarts automatically if the computer reboots:

```bash
# Install PM2 (process manager)
npm install -g pm2

# Start the proxy with PM2
cd lc1-vims-v2/server
pm2 start smsProxy.js --name lc1-sms-proxy

# Save the process list
pm2 save

# Set PM2 to start on system boot (follow the command it prints)
pm2 startup
```

---

## Default system credentials

| Account | Username | Password |
|---------|----------|----------|
| Village Chairperson | admin | lc1admin2024 |
| System Administrator | sysadmin | MoLG@Uganda2024 |

**Change both passwords immediately after first login.**

---

## Supported browsers

- Google Chrome (recommended)
- Microsoft Edge
- Mozilla Firefox
- Any modern Android browser (works as an installable app)

---

## Works offline

The system stores all data locally in your browser (IndexedDB).
No internet is required to register residents, issue letters,
or view records. Data syncs to the cloud when you go online,
if a sync server is configured in Settings.
