# 11 — Accounts, saving, admin console, Firebase

The teacher: "Let's just make a really simple username and password system, no google account required. These game
instances will not have any personal info in them. Give me a single administrator google o-auth login though. Firebase
sounds good but I have not set anything up with that system before, so let me know if I need to do anything on my end."

## 1. Modes

| Mode | When | Accounts | Saves |
|---|---|---|---|
| **Local** | `FIREBASE_ENABLED` false (the default until the teacher's setup), or `?adapter=local` / `?seed=` | `accounts/local.js` (localStorage) | `persistence/local.js` (localStorage) |
| **Firebase** | `app/src/firebase-config.js` filled in by `tools/configure.mjs` | `accounts/firebase.js` (Firebase Auth) | `persistence/firestore.js` (Cloud Firestore) |
| **Emulator** | Firebase code plus `?emulator=1` on localhost | Auth emulator :9099 | Firestore emulator :8080 (project `demo-home-blocks`) |

A small badge in the footer shows which mode is live: "Local mode: saves stay in this browser" / "Online".

## 2. Student accounts

- **Username**: `^[a-z0-9][a-z0-9_-]{2,19}$`, lowercased on entry. Hint: "Pick a game name. Not your real name."
- **Password**: at least 8 characters, with a show/hide toggle. Hint: "Don't reuse a password from another account."
- **Class code**: `^[A-Z0-9-]{4,12}$`, uppercased on entry. It must exist and be active.
- **Register** screen fields: username, password, confirm password, class code. **Log in** screen: username, password,
  "Keep me logged in on this device" (unchecked by default, because shared Chromebooks).
- **Forgot password**: "Ask your teacher. They can move your game to a new username." There are no emails, ever.

**Local provider** (`accounts/local.js`):
- stores `{username → {salt, hash (SHA-256 via WebCrypto, 100k PBKDF2 iterations), classCode, uid}}` in
  `homeblocks:v1:accounts`;
- class codes come from `config.LOCAL_CLASS_CODES` (default `['DEMO']`);
- it's meant for development and demos, and the UI says so.

**Firebase provider** (`accounts/firebase.js`):
- **Synthetic email**: `${username}@${ACCOUNTS.syntheticEmailDomain}` with the domain `players.example.com`.
  `example.com` is reserved, so no mail can ever be delivered there. **Never call any Firebase API that sends
  email** (password reset, verification, email-link).
- **Register**:
  1. validate the formats;
  2. `getDoc(classCodes/{code})`, where public `get` is allowed. If it's missing or inactive: "That class code isn't
     right. Check with your teacher.";
  3. `createUserWithEmailAndPassword`;
  4. write `players/{uid}` (§4). **If that write fails, `deleteUser(auth.currentUser)`** so no orphan account remains;
  5. create the initial save.
- **Errors**, mapped to friendly text:
  - `auth/email-already-in-use` → "That username is taken. Try another.";
  - `auth/invalid-credential` / `auth/wrong-password` / `auth/user-not-found` → "Username or password doesn't match.";
  - `auth/too-many-requests` → "Too many tries. Wait a minute, then try again.";
  - network errors → "Can't reach the server. Check your internet.";
  - `auth/weak-password` → "Use at least 8 characters."
- **Persistence**: `browserSessionPersistence` by default, or `browserLocalPersistence` when "keep me logged in" is checked.
- **Disabled accounts**: if `players/{uid}.disabled`, sign the student out and show "Your account is paused. Ask your teacher."

## 3. Admin (one person, Google sign-in)

- `app/admin.html` → `admin/adminMain.js`.
- Firebase mode: `signInWithPopup(GoogleAuthProvider)`, falling back to redirect if the popup is blocked.
  - The client checks `user.email === ADMIN_EMAIL` to show the console or "This account isn't the admin". **Real
    enforcement is in the Firestore rules.**
- Local mode: a "Local admin (dev only)" button that lists local profiles, so the console can be built and tested
  without Firebase.
- **Features**:
  - **Class codes**:
    - create (code + label, e.g. `IO-P3` "Period 3 Life Skills"), deactivate/reactivate, delete;
    - show the student count for each code.
  - **Student table** (from `players`):
    - columns: username, class, phase, game month, cash, net worth, credit score, wellbeing average, home (place +
      type), last active;
    - filter by class, sort by any column, search by username.
  - **Student detail** (reads `saves/{uid}`): the portfolio (read-only, reusing `ui/portfolio/*`), letters with their
    score reports, month history with wellbeing, and the current home.
  - **Actions**, each with a clear confirmation:
    - **Reset game**: write a fresh `createInitialState` to `saves/{uid}` and reset the summary.
    - **Transfer save**: copy `saves/{from}` → `saves/{to}` for a student who forgot their password and made a new
      username. Updates `players/{to}.summary` and sets `players/{from}` to `{disabled: true, transferredTo: toUid}`.
    - **Pause / unpause account**.
    - **Delete class data**: deletes every `saves` and `players` doc with that class code. The admin must type the code
      to confirm. Auth accounts remain but can't do anything; the console explains how to delete them in the Firebase
      console if wanted.
    - **Export CSV** of the current table.
- **Admin email**: `ADMIN_EMAIL` in `app/src/firebase-config.js`. `tools/configure.mjs` also bakes it into `firestore.rules`.

## 4. Firestore data model

```
classCodes/{code}   { label, active: true, createdAt }
players/{uid}       { username, classCode, createdAt, updatedAt, disabled: false, transferredTo?: uid,
                      summary: { phase, monthIndex, monthLabel, cashCents, netWorthCents, creditScore,
                                 wellbeingAvg, homeLabel, locationName, homeTypeId } }
saves/{uid}         { stateJson: string, version: number, updatedAt: number, saveCount: number }
```
- The state is stored as a **JSON string**, so nested arrays don't blow up Firestore's index entries.
  `firestore.indexes.json` exempts `stateJson` from indexing.
- **Load** reads `saves/{uid}`. **Save** writes `saves/{uid}` (and `players/{uid}.summary` only at phase changes, month
  ends and admin actions; see `02` §5).

## 5. Security rules (`firestore.rules.template` → `firestore.rules`)

Draft to start from. Task 49 must test every rule on the emulator.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function isAdmin() {
      return signedIn()
        && request.auth.token.email == '__ADMIN_EMAIL__'
        && request.auth.token.email_verified == true
        && request.auth.token.firebase.sign_in_provider == 'google.com';
    }
    function isSelf(uid) { return signedIn() && request.auth.uid == uid; }
    function isStudentEmail() {
      return request.auth.token.email.matches('^[a-z0-9][a-z0-9_-]{2,19}@players[.]example[.]com$');
    }
    function usernameFromEmail() { return request.auth.token.email.split('@')[0]; }
    function codeDoc(code) { return /databases/$(database)/documents/classCodes/$(code); }
    function playerPath(uid) { return /databases/$(database)/documents/players/$(uid); }
    function activePlayer(uid) {
      return exists(playerPath(uid)) && get(playerPath(uid)).data.disabled == false;
    }

    match /classCodes/{code} {
      allow get: if true;                               // check a code you already know
      allow list, create, update, delete: if isAdmin();
    }

    match /players/{uid} {
      allow read: if isSelf(uid) || isAdmin();
      allow create: if isSelf(uid) && isStudentEmail()
        && request.resource.data.keys().hasOnly(['username','classCode','createdAt','updatedAt','disabled','summary'])
        && request.resource.data.username == usernameFromEmail()
        && request.resource.data.disabled == false
        && exists(codeDoc(request.resource.data.classCode))
        && get(codeDoc(request.resource.data.classCode)).data.active == true;
      allow update: if isAdmin()
        || (isSelf(uid) && resource.data.disabled == false
            && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['summary','updatedAt']));
      allow delete: if isAdmin();
    }

    match /saves/{uid} {
      allow read: if isAdmin() || (isSelf(uid) && activePlayer(uid));
      allow create, update: if isAdmin()
        || (isSelf(uid) && activePlayer(uid)
            && request.resource.data.keys().hasOnly(['stateJson','version','updatedAt','saveCount'])
            && request.resource.data.stateJson is string
            && request.resource.data.stateJson.size() < 900000);
      allow delete: if isAdmin();
    }
  }
}
```

**Rules tests** (`tests/firebase/rules.test.js`, `@firebase/rules-unit-testing` against the emulator):
- A student can create their own player doc with an active code, but not with a missing or inactive code, not with a
  username that differs from their email, and not with `disabled: true`.
- A student can update only `summary` and `updatedAt`. They can't change `disabled`, `classCode` or `username`.
- A student can read and write their own save, but not someone else's. A disabled student can't read or write theirs.
  Writes over the size cap are denied.
- Anyone can `get` a class code. Only the admin can `list`, create or change codes.
- The admin (right email, verified, Google provider) can do everything. The same email through a password provider is
  denied, and so is any other Google account.

## 6. Saving behavior in Firebase mode

- `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`,
  so a Wi-Fi hiccup doesn't lose progress. Writes queue offline and sync later, and the header says "Offline — will sync".
- Throttling follows `02` §4, and at most one write is in flight at a time.
- **Conflicts**: last write wins. On load, if a copy cached in localStorage has a newer `updatedAt` than the server copy
  (a failed flush), push it. This is documented in the teacher guide ("play on one device at a time").
- **Free (Spark) plan quota** per day: 50k reads, 20k writes, 1 GiB stored, and 360 MB/day Hosting transfer.
  Keep vendor files cacheable (§8) and the first load lean.

## 7. Emulators & tests (task 49 sets these up)

- Java comes from a user-level JDK through mise: `mise install java@temurin-21`, run as
  `mise exec java@temurin-21 -- <cmd>`. No sudo, and nothing outside mise's own folders.
- `package.json` devDependencies: `firebase-tools` (pinned), `@firebase/rules-unit-testing`, `firebase`.
- Scripts:
  - `test:rules`: `firebase emulators:exec --only firestore,auth --project demo-home-blocks "node --test tests/firebase/"`;
  - `test:e2e:emulator`: runs `tools/shoot.mjs` step files against `?emulator=1` while the emulators are up.
- **Emulator admin sign-in** for tests: when connected to the emulator, `?fakeAdmin=<email>` signs in with
  `signInWithCredential(auth, GoogleAuthProvider.credential('{"sub":"admin-1","email":"<email>","email_verified":true}'))`,
  which the Auth emulator accepts. This path is compiled in, but it only runs when `?emulator=1` is set on localhost.

## 8. Hosting and configuration

- `firebase.json`:
  - hosting `public: "app"` with `cleanUrls: true`;
  - headers: `/vendor/**` → `Cache-Control: public, max-age=31536000, immutable` (vendor paths include versions);
    `**/*.@(js|css|json|svg|woff2)` → `public, max-age=3600`; `**/*.html` → `no-cache`;
  - emulators: auth 9099, firestore 8080, hosting 5000, UI off;
  - firestore rules and indexes files.
- `tools/configure.mjs --config <firebaseConfig.json or pasted JS object> --admin <email> [--project <id>]`:
  - writes `app/src/firebase-config.js` (`export const firebaseConfig = {...}; export const ADMIN_EMAIL = '...';
    export const FIREBASE_ENABLED = true;`);
  - renders `firestore.rules` from the template;
  - writes `.firebaserc`.
  - It's idempotent and prints the next steps.
- The committed defaults are a placeholder config, `FIREBASE_ENABLED = false`, and rules rendered with `admin@example.com`.

## 9. What the teacher does once (task 53 writes it up click by click in `docs/DEPLOY.md`)

1. Go to console.firebase.google.com and **create a project** (Google Analytics off). The free **Spark** plan needs no credit card.
2. Build → **Authentication** → Get started → Sign-in method: enable **Email/Password** and **Google**.
3. Build → **Firestore Database** → Create database → **production mode**, location `us-west2` (Los Angeles) or another
   US-West location. The location can't be changed later.
4. Project settings → Your apps → **Web** (`</>`) → register "home-sim", tick **Firebase Hosting**, and copy the `firebaseConfig`.
5. Either `node tools/configure.mjs --config config.json --admin you@gmail.com --project <id>`, or paste the config and
   admin email to Claude to run it.
6. `npx firebase-tools login` (a browser opens), then from `home-sim/`: `npx firebase-tools deploy --only hosting,firestore`.
7. Open `https://<project-id>.web.app/admin`, sign in with the admin Google account, and create a class code for each period.
8. Give students the URL and their period's code.

Troubleshooting notes to include:
- a blocked popup (allow popups, or the redirect fallback kicks in);
- `auth/unauthorized-domain` (add the domain under Authentication → Settings → Authorized domains);
- the school blocking Google sign-in for a haaspcs.net admin (use a personal Gmail as the admin instead);
- "permission denied" (rules not deployed, or the wrong admin email in the rules).
