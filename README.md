# Wellnest Smart Health Assistant

Java 17, Javalin, H2, and a plain HTML/CSS/JavaScript dashboard for educational health tracking.

## Run locally

1. Install Java 17 and Maven.
2. Double-click `build.bat` once, then `run.bat` to start the app.
3. Open http://localhost:7070. The local demo account is `demo` / `demo123`.

The default local configuration uses seeded demo data. The demo account and simulator are disabled automatically when `APP_DEMO_MODE=false`.

## Sign in with Google

Google sign-in is optional and needs a Google OAuth web client ID:

1. In [Google Cloud OAuth clients](https://console.cloud.google.com/auth/clients), create a **Web application** OAuth client.
2. Add `http://localhost:7070` as an authorized JavaScript origin for local testing.
3. Set `GOOGLE_CLIENT_ID` in the project-root `.env` and restart the app. Leave it blank if you do not want Google sign-in.
4. The login page will show Google's button when configured.
## Host on Render

The repository includes a Dockerfile and `render.yaml` configured for a small Render web service with a 1 GB persistent disk. It disables demo seed accounts and stores H2 at `/var/data/healthdb` so readings survive restarts and deploys. Configure `GOOGLE_CLIENT_ID` in Render to enable user sign-in. This single-instance setup is for a student demo, not production health records.

1. Create a private GitHub repository and upload the project. Keep `.env` out of Git; `.gitignore` already excludes it.
2. In Render, create a Blueprint from that GitHub repository and apply `render.yaml`.
3. Enter your `GOOGLE_CLIENT_ID` and, if you want live AI chat, a rotated `NVIDIA_API_KEY` when Render prompts for them. Never put secret values in `render.yaml` or Git.
4. Redeploy and verify sign-in and persistence.

Check Render's current pricing before deploying. See [Render Java hosting](https://render.com/hosting/java), [Render disks](https://render.com/docs/disks), and [Render pricing](https://render.com/pricing). Services with persistent disks are single-instance and cannot scale horizontally.
## AI and health data

`app.ai.chat.useReal=true` enables Nemotron chat independently of the demo risk assessor. The chat sends the user's question and recent conversation to NVIDIA. It sends recent readings only when the user checks **Use my recent readings when relevant**. Set `NVIDIA_API_KEY` in `.env` locally or in the hosting provider's secret settings. The model provides educational information, not a diagnosis or prescription.

## Project commands

- `build.bat` — compile and package `target/smart-health-assistant-1.0.0.jar`
- `run.bat` — load local `.env` values and run the JAR
- `mvn clean package` — equivalent Maven build when Maven and Java are on PATH

## Useful API routes

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Demo username/password login |
| GET | `/api/auth/google/config` | Public Google login configuration |
| POST | `/api/auth/google` | Verify Google ID token and sign in or register |
| GET/POST | `/api/medicines` | List or add medicines |
| GET/POST | `/api/sensor-data` | Read or record vitals |
| POST | `/api/risk-assessment` | Assess submitted vitals |
| POST | `/api/ask` | Ask the configured Nemotron model |
| GET | `/api/dashboard/summary` | Dashboard data |

The app is an educational prototype. Do not use it as a replacement for professional medical care.


