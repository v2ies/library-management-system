# UPHSD Molino Library Management System

A library system for the University of Perpetual Help System DALTA – Molino Campus, where students can register, browse, and request books online, and librarians can manage the collection and loans from an admin console. Runs fully in the browser with plain HTML, CSS, and JavaScript — no installation, no server, no internet needed.

## Contents

-   [Overview](#overview)
-   [Author](#author)
-   [Built With](#built-with)
-   [What It Can Do](#what-it-can-do)
-   [Folder Layout](#folder-layout)
-   [Run It](#run-it)
-   [Default Logins](#default-logins)
-   [Why This Exists](#why-this-exists)
-   [Next Steps](#next-steps)
-   [License](#license)

## Overview

The system has two sides. Students get a portal to sign up, log in, look through the catalog, ask to borrow books, follow their loans, and edit their profile. Librarians get a console showing library stats, plus tools to add books and categories, register members, approve or reject requests, hand out and take back copies, and review the full history. Overdue loans are flagged on their own, the theme can switch between light and dark, and everything is saved in the browser automatically.

## Author

**v2ies**

## Built With

Technology

Used For

HTML5

Page structure

CSS3

Design and responsive layout

JavaScript

All behavior, no frameworks

Browser Storage

Saving records on the device

## What It Can Do

-   **Member signup and login** — students join with their name, Student ID (`25-XXXX-XXX`), password, year, section, and course.
-   **Searchable catalog** — find books by title or author, narrow by category, and check copies available on the spot.
-   **Borrow requests** — students send requests that land in the admin queue as pending.
-   **Approvals with due dates** — librarians approve (14-day loan set automatically) or reject requests.
-   **Checkout and returns desk** — issue books directly, accept returns, and spot overdue items at a glance.
-   **Stats dashboard** — totals, per-category usage bars, and a feed of recent activity.
-   **Flexible categories** — add or remove your own shelves beyond Fiction, Science, History, and Reference.
-   **Student profiles** — display names and photos members can change themselves.
-   **Dark mode** — alternate theme that remembers your choice.

## Folder Layout

```
library-management-system-updated4/
├── index.html        Student pages: landing, login/register, portal
├── admin.html        Librarian pages: landing, login, console
├── styles.css        All styling, light and dark themes
├── common.js         Shared interface code, data handling, startup
├── student.js        Code used only by the student pages
├── admin.js          Code used only by the admin pages
├── public/
│   └── uphsd-logo.png    School logo
└── README.md

```

## Run It

No installation. Open the folder with a local server (not by double-clicking, or the two pages can't share data — a red banner warns you if you do):

-   **VS Code:** install the Live Server extension, right-click `index.html` → Open with Live Server, then open `admin.html` through the same address.
-   **Python:** run `python -m http.server 8000` in the folder, then visit `http://localhost:8000/index.html` and `http://localhost:8000/admin.html` in the same browser.

## Default Logins

-   **Admin:** username `admin`, password `library123`
-   **Students:** register any ID shaped like `25-XXXX-XXX` (must start with 25), password at least 6 characters

Records live in the browser, so each browser keeps its own copy — use the same browser for both pages when demoing.

## Why This Exists

A school project for practicing frontend development: forms and validation, dynamic pages, searching and filtering lists, keeping data consistent across screens, and responsive design with plain HTML, CSS, and JavaScript.

## Next Steps

-   Move records to a real database so every device shares one library
-   Replace the built-in admin login with proper accounts and protected passwords
-   Compute fines for late returns
-   Export history to CSV or PDF
-   Polish accessibility (labels, keyboard support)

## License

School project. Not for production use as-is.

© 2026 v2ies.
