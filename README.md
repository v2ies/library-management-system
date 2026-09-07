# UPHSD Molino Library Management System

A simple, offline-first library management system for the **University of Perpetual Help System DALTA – Molino Campus**. Built with plain HTML, CSS, and JavaScript — no frameworks, no server required. All data is stored in the browser via `localStorage`.

**Live Demo:** [https://v2ies.github.io/library-management-system/](https://v2ies.github.io/library-management-system/)

## Pages

| File         | Who it's for | Contents |
|--------------|--------------|----------|
| `index.html` | Students     | Landing panel → Student log in / registration → Student portal (Browse Books, My Books, Settings) |
| `admin.html` | Librarians   | Admin landing panel → Admin login → Admin console (Dashboard, Books, Students, Requests, Borrow, History) |

## Features

**Student portal (`index.html`)**
- Register with Full Name, Student ID, password, Year, Section, and Course
- Log in with Student ID + password
- Browse and search books by title/author, filter by category
- Request to borrow (goes to admin as a *pending* request)
- My Books: track pending / borrowed / overdue / returned items
- Settings: update display name and profile photo (stored locally, max 2MB)

**Admin console (`admin.html`)**
- Dashboard: totals, collection-by-category with utilization bars, recent activity
- Books: search, filter, add, and delete books; create and manage custom categories
- Students: search, register, and remove students
- Requests: approve (issues the book, sets a 14-day due date) or reject pending requests
- Borrow: manually issue books and process returns (overdue is flagged automatically)
- History: filterable record of borrowed / returned / overdue items

**General**
- Dark mode toggle (moon/sun button) with saved preference
- Toast notifications and delete confirmations
- Responsive layout for desktop and mobile

## Deploy to GitHub Pages (Live Site)

1. Go to the repository on GitHub: [v2ies/library-management-system](https://github.com/v2ies/library-management-system)
2. Click **Settings** → **Pages** (left sidebar under "Code and automation")
3. Under **Build and deployment** → **Source**, select **Deploy from a branch**
4. Branch: `main` · Folder: `/ (root)`
5. Click **Save**
6. Wait 1–2 minutes, then visit:  
   **https://v2ies.github.io/library-management-system/**

Student portal: `.../index.html` (or just the root URL)  
Admin console: `.../admin.html`

A `.nojekyll` file is already present so GitHub Pages serves the files as pure static HTML/JS without running Jekyll.

## Getting Started (Local)

> ⚠️ **Important:** open this project through a **local server**, not by double-clicking the files. Browsers give `file://` pages isolated storage, so `index.html` and `admin.html` would be unable to share data. If you open them directly, a red warning banner will tell you.

**Option A — VS Code Live Server (easiest)**
1. Install the *Live Server* extension in VS Code.
2. Open this project folder, right-click `index.html` → **Open with Live Server**.
3. Open `admin.html` through the same server address (same `http://127.0.0.1:5500` host).

**Option B — Python**
1. In this folder, run: `python -m http.server 8000`
2. Visit `http://localhost:8000/index.html` and `http://localhost:8000/admin.html` in the **same browser**.

## Default Credentials & Formats

- **Admin login:** username `admin` · password `library123`
- **Student ID format:** `25-XXXX-XXX` (must start with `25`, e.g. `25-1234-567`)
- **Password rule:** at least 6 characters
- **Loan period:** 14 days from issue date

## Data & Storage

- Everything (books, students, borrow records, categories, theme) lives in the browser's `localStorage` under the key `uphsd_library_v3`; login session uses `sessionStorage`.
- The project ships with 8 sample books and zero students/records — register a student to start the full request → approve → borrow → return flow.
- Data is per-browser: Chrome and Edge do **not** share it. Demo with both pages in the same browser.
- Open the two pages in two tabs to see live cross-tab sync (approving a request on the admin tab refreshes the student tab automatically).

## Project Structure

```
├── index.html   # Student side (landing, gate, portal)
├── admin.html   # Admin side (landing, login, console)
├── styles.css   # Shared theme (flat colors, light + dark mode)
├── common.js    # Shared logic, storage, navigation, cross-tab sync
├── student.js   # Student-side logic (index.html only)
├── admin.js     # Admin-side logic (admin.html only)
├── public/
│   └── uphsd-logo.png
├── .nojekyll    # Required for clean GitHub Pages serving
└── README.md
```

## Tech Stack

Vanilla HTML · CSS · JavaScript · Web Storage API (`localStorage` / `sessionStorage`). No dependencies, no build step.

> **Note on "backend":** This system uses the browser itself as the data store (client-side "backend"). It is fully functional for demos, single-user / single-browser use, and classroom presentation. No server, database, or hosting cost is required. Data does not sync across different devices or browsers.
