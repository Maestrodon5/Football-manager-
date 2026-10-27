# Personal Captain Mode Setup

This project is configured for one owner's use: the app has no login screen and attempts to obtain a captain session automatically.

## Required environment variables

- `JWT_SECRET`: a long, random secret (at least 32 random bytes). Never commit it to Git.
- `PERSONAL_MODE=true`: enables passwordless captain-token issuance for the single owner.

Generate a secret locally with:

```bash
openssl rand -base64 48
```

## Important: keep the deployment private

**Do not set `PERSONAL_MODE=true` on a publicly accessible deployment.** Anyone who can reach the passwordless token endpoint could obtain captain privileges and modify or delete club data. Protect the whole app before enabling personal mode, for example with hosting-provider access protection, a private VPN, or a private network/reverse proxy. Removing a login screen is not the same as making a website private.

If the site is not protected, leave `PERSONAL_MODE` unset. Captain mutations will remain unavailable rather than exposing owner access.

## Data persistence and scheduling

The app uses a SQLite file. On a normal self-hosted server, keep `DATABASE_PATH` on a persistent disk and back it up regularly. Serverless temporary directories (including `/tmp` on Vercel) are ephemeral, so SQLite data stored there can disappear between instances or deployments. The background weekly scheduler also needs a continuously running server process; serverless functions do not guarantee that a background interval stays alive.

For reliable personal use, run the Node server on a persistent host with a persistent disk, or migrate the database to a durable managed database before using a serverless deployment.

## Local development

```bash
npm install
npm run lint
npm test
npm run build
```

For local-only development, the app may use the development JWT fallback. Production captain actions require an explicit `JWT_SECRET`.
