# Fieldnote secrets demo

A fictional Fieldnote sign-in app used by the Sonar Learning course "Getting started with secret scanning". It is practice code for local authentication only. It does not reproduce a SonarQube interface or display SonarQube measures, issues, or analysis results.

This repository does not contain a token. The course gives you one synthetic, non-live token-shaped value to add yourself, so that your own change introduces the secret and your pull request analysis can detect it. Use fabricated credentials only.

## Contents

- `public/index.html`, `public/app.js`, and `public/styles.css`: responsive Fieldnote sign-in and a plain signed-in confirmation. The course adds the synthetic fixture to `public/app.js`.
- `server.js`: dependency-free local authentication server. It binds to `127.0.0.1`, verifies a configured demo password, and keeps expiring sessions in memory. It makes no external calls.
- `sonar-project.properties`: scanner configuration. The source scope is the repository root. The project key and organization come from your own settings, not from this file.
- `.github/workflows/sonarqube-cloud.yml`: project-analysis workflow for SonarQube Cloud.
- `workflow-templates/sonarqube-cloud.yml` and `workflow-templates/sonarqube-server.yml`: the two reference workflows. Use the one that matches your destination.

## Run locally

Use only fabricated values. Never enter a real password or token.

1. Check that Node.js is available with `node --version`.
2. From the repository root, start the server with fabricated credentials. The password must be at least 12 characters:

	```sh
	DEMO_EMAIL='learner@sonar.demo' DEMO_PASSWORD='local-only-demo-please-change' node server.js
	```

3. Open `http://127.0.0.1:4173` and sign in with those same fabricated values. If that port is busy, set `PORT=4174` before `node server.js` and open the matching port.
4. Confirm the signed-in message, reload the page to verify the session persists, then select **Sign out**.
5. Stop the server with Ctrl+C.

At startup, the server hashes the configured password with a random salt; it isn't embedded in project files or returned by the API. During sign-in, the browser sends the entered demo password to the loopback server over HTTP. The server keeps sessions in memory for 30 minutes, uses an HttpOnly, SameSite=Strict cookie, and limits repeated failed sign-ins. This is not production authentication: it has no persistent account store, HTTPS deployment, recovery flow, or production session store. Keep it bound to loopback and use fabricated credentials only. The browser-delivered API key added by the course is deliberately synthetic and isn't required by the login service, so signing in works with or without it.

## Run the project analysis

1. Fork or clone this repository into your own practice repository. Do not use a production repository.
2. Create a project in exactly one destination, SonarQube Cloud or SonarQube Server.
3. Use the workflow that matches your destination. For Cloud, `.github/workflows/sonarqube-cloud.yml` is already in place. For Server, replace it with `workflow-templates/sonarqube-server.yml`. Do not run both.
4. Set repository variable `SONAR_PROJECT_KEY` to the key of your SonarQube project. For Cloud, also set `SONAR_ORGANIZATION` and `SONAR_HOST_URL`; for Server, set `SONAR_HOST_URL`.
5. Add the analysis token as the repository secret `SONAR_TOKEN`. Never put a real token in a file, variable, screenshot, or log.
6. Create a branch, add the synthetic fixture to `public/app.js` as the course describes, and open a pull request targeting `main` to run the pre-merge scan. Inspect the Actions logs, wait for project processing, and investigate the issue in your selected product. Do not merge the fixture-bearing pull request.
7. Remove the synthetic fixture from `public/app.js`, push the correction to the same branch, and compare the next pull-request analysis.

GitHub push protection is likely to block the credential-shaped fixture even though SonarSource's test identifies it as non-live. You own your practice repository, so you decide whether to allow it. Don't disable push protection. Use the link in the blocked-push message to allow this one detected secret, choosing the reason that it is used in tests, then push again. Do not use a live credential, and never allow a real one.

## Workflow choices

GitHub Actions is a bounded reference implementation chosen because the repository is hosted on GitHub. The workflows run on pull requests targeting `main`, pushes to `main`, and manual dispatch. They use the official SonarSource scan action and full project analysis, not `sonar analyze secrets`.

The pull-request workflow detects findings before merge. It does not block merging by itself. To require a block, configure an appropriate quality gate and required branch-protection check separately, then validate that policy in the selected environment.

- Cloud: `SONAR_TOKEN`, `SONAR_PROJECT_KEY`, `SONAR_ORGANIZATION`, and `SONAR_HOST_URL`. Use `https://sonarcloud.io` for the EU region or `https://sonarqube.us` for the US region.
- Server: `SONAR_TOKEN`, `SONAR_PROJECT_KEY`, `SONAR_HOST_URL`. The runner must be able to reach the Server URL. Use an approved self-hosted runner if the instance is not reachable from GitHub-hosted runners.

The workflows pin `actions/checkout` to v7.0.1 by commit SHA and use `sonarqube-scan-action` v8.3.0 with scanner 8.2.0.6438. Review these references before adopting them elsewhere.

The local app uses only Node.js built-ins and requires no install or build step. The SonarSource scan action submits the full project analysis; it does not start the app. A successful action step does not prove the project result is already processed; wait for completion before opening the issue view.
