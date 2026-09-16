# Publishing a new GymOS desktop build

What to do after `npm run electron:build`: put the installer on GitHub, then
point the app's Downloads page at it.

The installer is ~120 MB. That is why it goes on a **GitHub Release** and not
into Firebase Storage — Storage's free tier allows about 1 GB of egress a
day, so roughly eight downloads before it starts refusing them or billing
you. A GitHub Release serves the same file free and unmetered, and the
customer's Download button behaves identically either way.

---

## 1. What the build produces

After a successful build, `release/` holds:

| File | Size | What it's for |
|---|---|---|
| `GymOS Setup 1.0.0.exe` | ~120 MB | **The installer.** This is the only file customers need. |
| `win-unpacked/` | ~477 MB | The app already unpacked, `GymOS.exe` inside. Useful for testing without installing, or for a machine where you'd rather copy a folder than run an installer. Not for customers. |
| `GymOS Setup 1.0.0.exe.blockmap` | small | Used by auto-update to download only changed parts. Harmless to upload. |
| `latest.yml` | small | Auto-update metadata. Harmless to upload. |

`release/` is git-ignored — these files are far too big for the repository,
which is exactly why they go to a Release instead.

> **If the build fails with `EPERM … rename 'release\win-unpacked.tmp'`**
> Something on this machine is holding a lock on `release/` (Windows Search,
> Defender, or an Explorer window sitting in that folder). Build to a
> different drive location and copy the results back:
>
> ```bash
> npm run build:electron
> npx electron-builder --config.directories.output="C:/Users/HP/gymos-release"
> ```
>
> Then copy `GymOS Setup 1.0.0.exe` and `win-unpacked/` into `release/`.

---

## 2. Put the installer on GitHub

### Using the website

1. Go to **https://github.com/abdulbasidys-hub/GymOS/releases**
2. Click **Draft a new release** (first time: **Create a new release**).
3. **Choose a tag** → type a new tag, e.g. `v1.0.0`, then
   **Create new tag: v1.0.0 on publish**.
4. **Release title**: `GymOS 1.0.0`.
5. Describe what changed — customers don't read this, but you will in six
   months when you need to know which build a gym is running.
6. Drag `release/GymOS Setup 1.0.0.exe` into the
   **Attach binaries** box. Wait for it to reach 100 % — a 120 MB upload is
   not instant, and publishing early produces a release with no file on it.
   Optionally attach `latest.yml` and the `.blockmap` too.
7. Click **Publish release**.

### Using the command line

The `gh` CLI does the same thing in one command:

```bash
gh release create v1.0.0 \
  "release/GymOS Setup 1.0.0.exe" \
  --title "GymOS 1.0.0" \
  --notes "First packaged build."
```

---

## 3. Copy the direct download link

On the published release page, **right-click the `.exe` asset → Copy link
address**. It looks like:

```
https://github.com/abdulbasidys-hub/GymOS/releases/download/v1.0.0/GymOS.Setup.1.0.0.exe
```

That URL downloads the file directly. Two things to watch:

- Use the **`/releases/download/…`** link, not the `/releases/tag/…` page
  link. The page link opens GitHub instead of downloading.
- GitHub replaces spaces in asset names with dots, so
  `GymOS Setup 1.0.0.exe` becomes `GymOS.Setup.1.0.0.exe` in the URL. Copy
  the link rather than typing it.

Paste it into a private browser window first and confirm the download starts.
A link that needs a GitHub login is the one mistake that isn't visible from
inside GymOS — your customers would just see a broken button.

---

## 4. Point GymOS at it

1. Sign in to GymOS as **super admin**.
2. Open **Uploads** in the sidebar.
3. Find the **GymOS desktop app** card.
4. Choose **Link** (not *Upload a file*) — this is the whole reason the
   link option exists.
5. **Link to the file** — paste the URL from step 3.
6. **File name shown to the customer** — `GymOS Setup 1.0.0.exe`.
7. **Version** — `1.0.0`.
8. **Notes** — optional, shown under the title on the customer's page.
9. **Save**.

Now sign in as an **owner** and open **Downloads**. The entry should show the
version and file name with a green **Download** button. Until you do this it
reads *"Not available yet — check back shortly."*

Only owners see the installer. Receptionists never do — installing software
on a gym's computer is the owner's decision.

---

## 5. While you're there: the two guides

The same Uploads page publishes the manuals. These are small, so **upload
them** rather than linking:

| Card | File |
|---|---|
| Owner's guide | `docs/GymOS-Owner-Guide.pdf` |
| Receptionist's guide | `docs/GymOS-Receptionist-Guide.pdf` |

Owners see the owner's guide, receptionists see theirs. Until these are
published both roles see *"Not available yet"* where the guide should be.

Rebuild the PDFs any time with:

```bash
powershell -File scripts/build-guides.ps1
```

---

## 6. Releasing an update later

1. Bump `version` in `package.json` (`1.0.0` → `1.0.1`). The installer's
   file name follows it.
2. `npm run electron:build`
3. New GitHub Release with a new tag (`v1.0.1`) and the new `.exe`.
4. Uploads → **GymOS desktop app** → paste the new link, update the version,
   **Save**. It replaces the old entry rather than adding a second one, so
   customers only ever see the current build.

Leave old releases on GitHub. They cost nothing and they're the only way
back if a build turns out to be bad.
