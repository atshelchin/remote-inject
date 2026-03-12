# Chrome Web Store OAuth Setup

How to get the three secrets needed for `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`.

---

## Step 1 — Enable the Chrome Web Store API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or reuse an existing one)
3. Go to **APIs & Services → Library**
4. Search for **"Chrome Web Store API"** → Enable it

## Step 2 — Create OAuth 2.0 credentials

1. Go to **APIs & Services → Credentials**
2. Click **"Create Credentials" → "OAuth client ID"**
3. Application type: **Desktop app**
4. Name it anything (e.g. "CWS Upload")
5. Download the JSON — you now have `client_id` and `client_secret`

## Step 3 — Get the refresh token

Run this in a terminal (replace values from the JSON above):

```bash
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret

# Open this URL in your browser, sign in with the Google account
# that owns the Chrome Web Store developer account:
open "https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=$CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob"
```

After authorizing, Google shows a **one-time code**. Exchange it for a refresh token:

```bash
CODE=paste-the-code-here

curl -s -X POST https://oauth2.googleapis.com/token \
  -d "code=$CODE" \
  -d "client_id=$CLIENT_ID" \
  -d "client_secret=$CLIENT_SECRET" \
  -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob" \
  -d "grant_type=authorization_code" | python3 -m json.tool
```

Copy the `refresh_token` value from the response.

## Step 4 — Get your extension ID

1. Go to [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Upload your first zip manually ("New Item")
3. After saving as draft, the URL contains the extension ID:
   `https://chrome.google.com/webstore/devconsole/.../<EXTENSION_ID>/...`

## Step 5 — Add secrets to GitHub

In your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name        | Value                     |
|--------------------|---------------------------|
| `CWS_EXTENSION_ID` | e.g. `abcdefghijklmnop...` |
| `CWS_CLIENT_ID`    | from Google Cloud Console  |
| `CWS_CLIENT_SECRET`| from Google Cloud Console  |
| `CWS_REFRESH_TOKEN`| from step 3                |

Once all four secrets are set, every version bump in `packages/chrome-extension/package.json` pushed to `main` will automatically build, zip, create a GitHub Release, **and** submit the new version to the Chrome Web Store.
