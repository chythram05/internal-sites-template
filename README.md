# Internal Static Sites Deployment Platform

Deploy an internal drag-and-drop static site platform for your company using [Workers for Platforms](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/). Employees upload files and get a live URL -- every site is protected behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/).

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/internal-sites-template)

<!-- dash-content-start -->

## Features

- **Drag & drop deploy** - Upload a folder or ZIP file and get a live URL instantly
- **Protected by Access** - Every site sits behind Cloudflare Access. Employees sign in with your company identity provider
- **Subdomain routing** - Each site gets its own subdomain: `site-name.yourcompany.com`
- **Works on workers.dev** - Test immediately after deploy, no custom domain required
- **Deployment tracking** - Tracks who deployed what and when, stored in D1
- **Admin dashboard** - View all deployed sites and deployment history at `/admin`

## How It Works

1. **Workers for Platforms** - Each deployed site becomes an isolated Worker in a dispatch namespace. The platform routes requests to the correct site Worker
2. **D1** - Stores site metadata (name, slug, owner, timestamps) and deployment history
3. **Cloudflare Access** - Enforces company login. The platform verifies the signed JWT from Cloudflare Access to identify deployers

## Bindings Used

- **dispatcher** (Workers for Platforms) - Routes requests to deployed site Workers
- **DB** (D1) - Stores site metadata and deployment history

<!-- dash-content-end -->

---

## Setup

### 1. Create your API token

The platform needs an API token to deploy Workers into the dispatch namespace.

1. Go to [**API Tokens**](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token** > **Create Custom Token**
3. Set permissions: **Account** > **Workers Scripts** > **Edit**
4. Scope it to your account only
5. Copy the token — you will enter it when prompted during the Deploy to Cloudflare flow

### 2. Deploy the template

Click the **Deploy to Cloudflare** button above and follow the prompts. Paste your API token when asked for `DISPATCH_NAMESPACE_API_TOKEN`.

### 3. Enable your Worker URL

After deployment completes:

1. Go to [**Workers & Pages**](https://dash.cloudflare.com/?to=/:account/workers-and-pages) in the Cloudflare dashboard
2. Click on your newly deployed Worker (named `internal-sites-template` by default)
3. Go to **Settings** > **Domains & Routes**
4. Under **Worker URL**, click **Enable** and confirm — this enables your `workers.dev` URL

### 4. Require company login

Protect your Worker with Cloudflare Access so only company employees can access it.

1. Go to [**Workers & Pages**](https://dash.cloudflare.com/?to=/:account/workers-and-pages) and select your Worker
2. Select the **Access** tab
3. Select **Protect this Worker behind Access**
4. Choose **All traffic** to keep this Worker and all sites deployed by employees private by default
5. Under **Authentication policy**, select `Emails ending in` → `@yourcompany.com` to restrict access to your company email domain
6. Optionally review the session duration
7. Select **Apply Access**

Every request now requires company login.

### 5. Enable JWT verification

The platform cryptographically verifies each request by checking the signed JWT that Cloudflare Access attaches. This prevents spoofed identity headers.

1. Go to [**Zero Trust**](https://one.dash.cloudflare.com/) > **Access** > **Applications**
2. Select your application and open **Additional settings**
3. Copy the **Application Audience (AUD) Tag**
4. Note your **team domain** from [**Settings**](https://one.dash.cloudflare.com/) > **Custom Pages** (e.g. `https://mycompany.cloudflareaccess.com`)
5. Set both as Worker environment variables:

```bash
npx wrangler secret put ACCESS_AUD
# Paste the AUD tag when prompted

npx wrangler secret put ACCESS_TEAM_DOMAIN
# Paste the full team domain URL when prompted (e.g. https://mycompany.cloudflareaccess.com)
```

Alternatively, add them to the `vars` section of `wrangler.jsonc` if you prefer them as plain environment variables.

> **Note:** The platform returns 401 on all non-localhost requests until both `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are configured. You can always test locally with `npm run dev` without configuring these.

### 6. Deploy your first site

1. Go back to [**Workers & Pages**](https://dash.cloudflare.com/?to=/:account/workers-and-pages) and select your Worker
2. On the **Overview** tab, click the `workers.dev` link to open the platform
3. Upload a folder or ZIP containing an `index.html`
4. Click **Deploy site**
5. Open the generated URL shown after deployment

---

## Attach your platform domain

Update `SITE_DOMAIN` in `wrangler.jsonc` to your domain. The platform switches to subdomain routing automatically.

**a. Update config** in `wrangler.jsonc`:

```jsonc
{
  "workers_dev": false,
  "vars": {
    "SITE_DOMAIN": "yourcompany.com"
  },
  "routes": [
    { "pattern": "yourcompany.com/*", "zone_name": "yourcompany.com" },
    { "pattern": "*.yourcompany.com/*", "zone_name": "yourcompany.com" }
  ]
}
```

**b. Add DNS records** in your Cloudflare DNS settings:

| Type | Name | Content     | Proxy   |
|------|------|-------------|---------|
| A    | `@`  | `192.0.2.1` | Proxied |
| A    | `*`  | `192.0.2.1` | Proxied |

**c. Redeploy:**

```bash
npx wrangler deploy
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Platform Worker (this template)                            │
├─────────────────────────────────────────────────────────────┤
│  yourcompany.com/deploy    → Drag & drop deploy UI          │
├─────────────────────────────────────────────────────────────┤
│  Deployed Sites (Workers for Platforms)                     │
│  ├── docs.yourcompany.com      → Employee's site            │
│  ├── handbook.yourcompany.com  → Employee's site            │
│  └── ...                                                    │
├─────────────────────────────────────────────────────────────┤
│  Cloudflare Access                                          │
│  └── All routes require company identity provider login     │
└─────────────────────────────────────────────────────────────┘
```

On workers.dev (testing mode), sites use path-based routing instead:

```
your-worker.workers.dev/deploy          → Deploy UI
your-worker.workers.dev/sites/docs/     → Deployed site
```

---

## Local Development

### Run tests (no Cloudflare account required)

```bash
npm test
```

Unit tests run entirely in Miniflare -- no login, no network, no Cloudflare resources created.

### Full local setup

To deploy test sites from the local UI, you need a Cloudflare account with [Workers for Platforms](https://dash.cloudflare.com/?to=/:account/workers-for-platforms) enabled.

> **What runs where:** The main Worker and D1 database run on your computer via Miniflare. However, deploying a site from the local UI calls the Cloudflare API and **creates a real Worker in your Cloudflare account**. Use `npm test` to avoid creating any real resources.

**1. Sign in to Cloudflare**

```bash
npx wrangler login
```

**2. Set your Account ID**

Find your Account ID on the [Cloudflare dashboard](https://dash.cloudflare.com/) (copy from the right sidebar of the account home page). Set it in `wrangler.jsonc`:

```jsonc
"vars": {
  "ACCOUNT_ID": "your-account-id"
}
```

**3. Create the dispatch namespace**

This is the Workers for Platforms namespace where deployed sites are stored:

```bash
npx wrangler dispatch-namespace create internal-sites
```

**4. Create the D1 database**

```bash
npx wrangler d1 create internal-sites-platform
```

Copy the `database_id` from the output and paste it into `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "internal-sites-platform",
    "database_id": "paste-your-database-id-here"
  }
]
```

**5. Create an API token**

The platform needs a token to deploy Workers into the dispatch namespace:

1. Go to [API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. **Create Custom Token** with permission: **Account** > **Workers Scripts** > **Edit**
3. Copy the token and save it to `.dev.vars`:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and replace `your-token-here` with the real token.

**6. Install and run**

```bash
npm install
npm run dev
```

Open [http://localhost:8787/deploy](http://localhost:8787/deploy) to use the platform.

Local dev uses path-based routing automatically (`/sites/site-name/`). JWT verification is bypassed on localhost -- a placeholder identity (`local-dev@localhost`) is used automatically.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Company sign-in is required" | Access is not configured. See **Require company login** in the Setup section above |
| "Could not create asset upload session" | Check that `DISPATCH_NAMESPACE_API_TOKEN` is set with Workers Scripts Edit permission |
| "Dispatch namespace not found" | Enable [Workers for Platforms](https://dash.cloudflare.com/?to=/:account/workers-for-platforms) and run `npx wrangler dispatch-namespace create internal-sites` |
| 404 on deployed sites | Ensure uploaded files include `index.html` at the root |
| Database errors | Tables auto-create on first request. Check the D1 database in the Cloudflare dashboard |
| "Access verification is not configured" | Set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`. See **Enable JWT verification** above |
| "Could not delete site from Cloudflare" | Check that `DISPATCH_NAMESPACE_API_TOKEN` is valid and has Workers Scripts Edit permission |

**View logs:**

```bash
npx wrangler tail
```

---

## Security

The admin page (`/admin`) shows all deployed sites and deployment history. Protect it with [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-apps/) so only admins can reach it:

1. Go to **Zero Trust → Access → Applications**
2. Click **Create new application** → **Continue with self-hosted and private**
3. Under **Destinations > Public hostnames**, configure your Worker's domain:
   - **Subdomain**: the name of your Worker (e.g. `internal-sites-template`)
   - **Domain**: select your `*.workers.dev` domain from the dropdown, or your custom domain if you have one configured
   - **Path**: `admin*`
4. Add an Access policy and configure who can access it — for example, restrict to specific admin email addresses
5. Save the application

This scopes the policy to `/admin*` only, so employees can still reach `/deploy` freely without an additional login step.

---

## Prerequisites

- **Cloudflare Account** with [Workers for Platforms](https://dash.cloudflare.com/?to=/:account/workers-for-platforms) enabled
- **Node.js 22+**

---

## License

Apache-2.0
