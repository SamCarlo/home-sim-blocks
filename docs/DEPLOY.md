# Putting Home & Life Sim: Block Edition online (Firebase)

> **Use a new Firebase project for the Block Edition.** Don't reuse the classic game's project. Block Edition saves are a
> newer format (schema v3) that the classic game can't read, and the two would share one database of accounts and saves.
> Follow the steps below from Step 1 with a new project name such as `home-blocks`.

This guide takes you from "the game runs on my laptop" to "students play it at a web address and I can see their
progress." It assumes you have never used Firebase. Plan on about 20 minutes. You do it once.

Until you finish these steps the game runs in **local mode**: everything is saved in each browser, there are no real
accounts, and the admin console only sees that one browser. That's fine for trying it out (see `README.md`).

**What it costs:** nothing. You'll use Firebase's free **Spark** plan, which asks for no credit card. Six periods of 30
students playing every day stay well under the free limits (about 7,000 database writes a day against 20,000).

**What you need:**
- A Google account to be the admin. A personal Gmail is safest (see [Troubleshooting](#school-google-account-blocked)).
  This is the only account that can open the admin console.
- This computer, with the `home-sim-blocks` folder and Node.js 20 or newer (`node --version` prints `v20` or higher).
- A terminal open in the `home-sim-blocks` folder. Every command below is typed there:
  ```
  cd /home/sam/Documents/work/teaching/interfaces/home-sim-blocks
  ```
- Run `npm install` once if the `node_modules` folder is missing. It installs the Firebase command-line tool locally;
  nothing is installed system-wide.

> **If a menu looks different.** Google rearranges the Firebase console from time to time. If a name below isn't where
> this guide says, type it into the search box at the top of the console (for example "Authentication") and it will
> take you there.

---

## Step 1. Create the project (3 minutes)

1. Go to **https://console.firebase.google.com** and sign in with your admin Google account.
2. Click **Create a project** (on some screens it's a large **Get started with a Firebase project** card).
3. **Project name:** type something like `home-blocks`. Under the name, Firebase shows the **project ID** it will use, such
   as `home-blocks-4f2a1`. Write the project ID down. Your game's address will be `https://<project ID>.web.app`.
   - Click the pencil next to the ID if you want to choose a nicer one. It can't be changed later.
4. Accept the terms and click **Continue**.
5. If it asks about **Gemini in Firebase** or other AI assistance, you can turn it off. The game doesn't use it.
   Click **Continue**.
6. **Google Analytics:** switch it **off**. The game doesn't need it and it would collect data about students.
7. Click **Create project**, wait for "Your new project is ready", then click **Continue**.

You're now on the project's home page. The left sidebar is where everything else lives. The bottom of the sidebar
should say **Spark** ("No-cost"). If it says Blaze, you don't need to change anything, but you don't need Blaze either.

## Step 2. Turn on sign-in (3 minutes)

Students sign in with a username and password. You sign in with Google. Both have to be switched on.

1. In the left sidebar, open **Build** (sometimes shown under **Product categories**) and click **Authentication**.
2. Click **Get started**.
3. You land on the **Sign-in method** tab. Under **Native providers**, click **Email/Password**.
   - Switch on the first toggle, **Email/Password**.
   - Leave **Email link (passwordless sign-in)** off.
   - Click **Save**.
4. Click **Add new provider**, then **Google**.
   - Switch on **Enable**.
   - **Public-facing name for project:** something students would recognize, like `Home & Life Sim: Block Edition`.
   - **Support email for project:** pick your admin email from the list.
   - Click **Save**.
5. The list now shows **Email/Password: Enabled** and **Google: Enabled**.

Students never see an email address. The game turns a username like `lani7` into `lani7@players.example.com`
behind the scenes, so no student personal information is stored.

## Step 3. Create the database (3 minutes)

1. In the left sidebar under **Build**, click **Firestore Database**.
2. Click **Create database**.
3. If it asks you to **Select edition**, choose **Standard edition** and click **Next**.
4. **Database ID:** leave it as `(default)`.
5. **Location:** choose **us-west2 (Los Angeles)**. Any other US West location is also fine.
   **This can't be changed later**, so double-check before going on. Click **Next**.
6. **Secure rules:** choose **Start in production mode**. (Production mode locks everything. In step 6 you replace
   those rules with the game's own rules, which let each student see only their own save and let only you see everyone.)
7. Click **Create** and wait for the empty **Data** tab to appear.

## Step 4. Register the web app and copy its settings (3 minutes)

1. At the top of the left sidebar, click the **gear icon** next to **Project Overview**, then **Project settings**.
2. Stay on the **General** tab and scroll down to **Your apps**. It says "There are no apps in your project".
3. Click the **Web** button. Its icon is `</>`.
4. **App nickname:** type `home-blocks`.
5. Tick **Also set up Firebase Hosting for this app**. If a list of sites appears, leave the one it suggests.
6. Click **Register app**.
7. Under **Add Firebase SDK** you'll see a box of code. Either tab (**Use npm** or **Use a `<script>` tag**) is fine.
   Find the part that looks like this:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "home-blocks-4f2a1.firebaseapp.com",
     projectId: "home-blocks-4f2a1",
     storageBucket: "home-blocks-4f2a1.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123"
   };
   ```
   Select from `const firebaseConfig = {` down to the closing `};` and copy it. Copying the whole box is also fine; the
   configure tool only reads the `firebaseConfig` part.
8. Open a plain text editor, paste it, and save it as **`firebase-snippet.txt` in your Downloads folder**
   (`~/Downloads/firebase-snippet.txt`). Keep it outside the `home-sim-blocks` folder so it doesn't end up in the game's files.
9. Back in the browser, click **Next** through the remaining screens (they describe installing the CLI and deploying,
   which the steps below cover) and finish with **Continue to console**.

The `apiKey` in that snippet isn't a password. It only says which project to talk to; the security rules are what
protect the data. It's normal for it to be visible in the published game.

> If you closed the window before copying: **Project settings → General → Your apps**, click your `home-blocks` app, and
> the same `firebaseConfig` box is under **SDK setup and configuration** (choose **Config**).

## Step 5. Point the game at your project (1 minute)

In the terminal, in the `home-sim-blocks` folder, run this with **your** admin email:

```
node tools/configure.mjs --config ~/Downloads/firebase-snippet.txt --admin you@gmail.com
```

It prints something like:

```
configure: project home-blocks-4f2a1, admin you@gmail.com
  updated    app/src/firebase-config.js
  updated    firestore.rules
  updated    .firebaserc

Next steps (docs/DEPLOY.md has the click-by-click version):
  ...
```

That changed three files:
- `app/src/firebase-config.js`: the game now runs in Firebase mode and knows your project and admin email;
- `firestore.rules`: the security rules, with your admin email written in;
- `.firebaserc`: tells the deploy command which project to use.

Notes:
- The admin email must be exactly the Google account you'll sign in with. Capital letters don't matter.
- The project ID comes from the snippet. Add `--project <id>` only if you want to override it.
- Running the command again with the same input changes nothing, so it's safe to repeat.
- Rather not type it? Paste the snippet and your admin email to Claude and ask it to run the configure step.
- Changed your mind? `node tools/configure.mjs --placeholder` puts the game back into local mode.

## Step 6. Publish (3 minutes)

1. Sign the Firebase command-line tool into your admin Google account. A browser window opens; choose the account,
   click **Allow**, and come back to the terminal when it says "Success! Logged in as ...":
   ```
   npx firebase-tools login
   ```
   If it asks whether Firebase may collect CLI usage information, answer `n` (either answer works).
2. Publish the website and the database rules:
   ```
   npx firebase-tools deploy --only hosting,firestore
   ```
   This takes about a minute. It ends with:
   ```
   ✔  Deploy complete!

   Project Console: https://console.firebase.google.com/project/home-blocks-4f2a1/overview
   Hosting URL: https://home-blocks-4f2a1.web.app
   ```
   The **Hosting URL** is the address students use.

You only log in once per computer. Later, after any change to the game, run the same `deploy` command again.

## Step 7. Check that it worked (5 minutes)

Do these in order. Each one checks a different piece.

1. **The site is up.** Open the Hosting URL. You should see the game's welcome screen with **Log in** and
   **Create account** tabs. (If you see a page that says "Site Not Found", wait a minute and refresh; a brand-new site
   can take a moment.)
2. **The admin console works.** Open `https://<project ID>.web.app/admin` and click **Sign in with Google**. A Google
   popup opens; choose your admin account. You should see the **Class codes** card and an empty **Students** card.
   - If it says "This account isn't the admin", you signed in with a different Google account than the one you gave
     configure. Click **Sign out** and choose the right one.
3. **Make a class code.** In **Class codes**, type a **New code** like `IO-P3` and a **Label** like `Period 3 Life Skills`,
   then click **Create code**. Codes are 4 to 12 letters, numbers or hyphens.
4. **A student can register.** In a private/incognito window, open the Hosting URL, click **Create account**, and make
   a test student (username `testkid`, a password of at least 8 characters, class code `IO-P3`). Fill in a job and
   savings on the first screen so the student reaches the Plan table.
5. **You can see the student.** Back in the admin tab, reload. `testkid` appears in the **Students** table with phase
   **Plan**.
6. **The data is in Firestore.** In the Firebase console, **Build → Firestore Database → Data**. You should see the
   collections `classCodes`, `players` and `saves`.
7. **Clean up the test student.** In the admin console, open `testkid`, and use **Reset game** if you want to reuse it,
   or leave it; it does no harm. To remove its sign-in completely, use the Firebase console:
   **Build → Authentication → Users**, find `testkid@players.example.com`, click the three-dot menu, **Delete account**.

When all seven pass, give each class the Hosting URL and their period's code. Make one code per period so the admin
table can filter by class.

---

## Troubleshooting

### The Google sign-in popup doesn't open
The browser blocked it. Click the blocked-popup icon at the right of the address bar and choose **Always allow
popups** from this site, then click the sign-in button again. If popups stay blocked, the console automatically
switches to a full-page redirect: you'll leave the page, sign in with Google, and land back on the admin console.

### `auth/unauthorized-domain` or "This domain is not authorized"
Firebase only allows sign-in from addresses it knows. `<project ID>.web.app`, `<project ID>.firebaseapp.com` and
`localhost` are allowed automatically. If you opened the game from any other address (for example a custom domain):
**Build → Authentication → Settings** tab → **Authorized domains** → **Add domain**, type the domain (no `https://`),
and click **Add**.

### School Google account blocked
School-managed Google accounts (like a `haaspcs.net` address) are often blocked from signing in to outside apps by
the school's IT settings, so the admin popup fails or shows "Access blocked." Use a personal Gmail as the admin instead:
re-run step 5 with `--admin yourname@gmail.com`, then deploy again (step 6, part 2). Students are unaffected; they
never use Google.

### "Missing or insufficient permissions" / "permission denied"
The database refused a request. Two usual causes:
- **The rules were never published.** Run `npx firebase-tools deploy --only firestore` and try again. You can see the
  live rules in the console under **Firestore Database → Rules**; they should mention your admin email, not
  `admin@example.com`.
- **The admin email in the rules isn't the account you signed in with.** Re-run step 5 with the right `--admin`, then
  deploy again.

In the admin console this shows as "The database refused that change (admin only)."

### Students see "That class code isn't right"
The code doesn't exist or was deactivated. Check **Class codes** in the admin console. Capital letters don't matter
(`io-p3` works for `IO-P3`).

### `npx: command not found` or `node: command not found`
Node.js isn't installed. Install the current LTS version from **https://nodejs.org**, open a new terminal, and start
from the `cd` line in "What you need."

### `Error: Failed to authenticate, have you run firebase login?`
Run `npx firebase-tools login` (step 6, part 1). If the browser never opens, use
`npx firebase-tools login --no-localhost` and follow the link it prints.

### `Error: Invalid project selection` or `Failed to get Firebase project`
The CLI is signed into a different Google account than the one that owns the project, or `.firebaserc` names the wrong
project. Check with `npx firebase-tools projects:list`. To switch accounts: `npx firebase-tools logout`, then
`npx firebase-tools login` again. To fix the project ID, re-run step 5.

### `configure: ...` error
- `--config and --admin are both required`: both options are needed (step 5).
- `no { … } object found in the config` (or another config error): the file doesn't contain the
  `firebaseConfig = { ... }` block. Copy it again (step 4).

### The site still shows the old version after a deploy
Pages are never cached and other files refresh within the hour. A hard refresh (**Ctrl+Shift+R**) shows the new
version at once.

### Undo a bad deploy
**Build → Hosting** → under **Release history**, find the previous release, click its three-dot menu and choose
**Roll back**. The database isn't affected.

---

## Later

- **Changing a rule or adding a place** is covered in `docs/TEACHER_GUIDE.md`. After any change, run
  `bash tools/check.sh`, then deploy again (step 6, part 2).
- **New school year:** in the admin console, use **Delete class data** on last year's codes, then delete their sign-in
  accounts under **Build → Authentication → Users** (each row's three-dot menu → **Delete account**).
- **Moving to a new computer:** copy the `home-sim-blocks` folder, run `npm install`, and `npx firebase-tools login`.
  Configure doesn't need to be run again; its results are in the folder.
