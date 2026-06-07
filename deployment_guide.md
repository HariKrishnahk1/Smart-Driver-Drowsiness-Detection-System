# Deployment Guide: Live Hosting on Render.com

This guide provides step-by-step instructions to deploy the **Smart Driver Drowsiness Detection System (SDDDS)** to Render.com.

The project is configured as a **multi-service deployment** containing:
1. **Python Flask Backend**: Deployed as a web service via a Docker container (handles OpenCV system library dependencies automatically).
2. **SQLite Database**: Saved on a Render Persistent Disk so alert logs, user accounts, and history are preserved between deployments.
3. **Vite React Frontend**: Deployed as a fast Static Site.

---

## Prerequisites
* A [GitHub](https://github.com) account.
* A [Render.com](https://render.com) account.
* Git installed locally.

---

## Step 1: Push Code to GitHub

Since Render deploys directly from GitHub, you need to push your local repository:

1. Open your terminal in the project root directory.
2. Initialize Git (if not already initialized):
   ```bash
   git init
   git add .
   git commit -m "Configure deployment templates for Render"
   ```
3. Create a new repository on GitHub (keep it public or private).
4. Link your local project and push it to GitHub:
   ```bash
   git remote add origin <YOUR_GITHUB_REPO_URL>
   git branch -M main
   git push -u origin main
   ```

---

## Step 2: Deploy to Render using Blueprints

We have included a `render.yaml` Blueprint template in the root directory. This automates the setup of both services:

1. Log in to your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** in the top right corner and select **Blueprint**.
3. Connect your GitHub repository.
4. Render will read the `render.yaml` file and automatically configure:
   * The Dockerized Python backend web service.
   * The SQLite persistent volume disk.
   * The Static React frontend web service.
5. Click **Apply** to start the deployment.

---

## Step 3: Link Frontend and Backend URLs

Since Render will allocate a unique URL for your backend (e.g. `https://sddds-backend-xyz.onrender.com`), you need to tell your frontend where to find it:

1. Once the backend service deployment is complete, copy its **live URL** from the Render dashboard (it will look like `https://sddds-backend.onrender.com` or similar).
2. Go to your **Static Frontend service** on the Render dashboard.
3. In the sidebar, click **Environment**.
4. Edit the environment variable named **`VITE_API_BASE`** and set its value to your copied backend URL (without a trailing slash):
   * Key: `VITE_API_BASE`
   * Value: `https://<your-backend-subdomain>.onrender.com`
5. Click **Save Changes**. Render will automatically rebuild and redeploy your frontend with the correct live URL!

---

## Step 4: Verify Deployment

1. Open your frontend's live URL (provided by Render in the static service dashboard).
2. The page will load the intro video and the login portal.
3. Register/Login as a driver and pair your camera using the video file `Video Project 11.mp4` (IP Camera stream) or webcam!
4. The stream will connect and show live telemetry and AI overlay meshes hosted entirely in the cloud!
