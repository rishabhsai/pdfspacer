# PDFSpacer plugin: submission checklist

This checklist covers the steps that need a person. The package files are
ready:

- `chatgpt/plugin.json`: portable Agent Plugins manifest. Listing text, the
  onboarding skill, review test cases, commerce answer and release notes are
  under `extensions.com.openai`.
- `chatgpt/mcp.json`: the hosted MCP endpoint
  `https://pdfspacer-chatgpt.vercel.app/api/mcp`, with no authentication.
- `chatgpt/skills/pdfspacer/SKILL.md` and `chatgpt/skills/onboarding/SKILL.md`.
- `chatgpt/assets/icon.svg` (light) and `chatgpt/assets/icon-dark.svg` (dark).
- `chatgpt/review/test-cases.json`: the same five positive and three negative
  cases that `plugin.json` embeds, kept as a readable copy.

Source docs:

- Submission guide: https://developers.openai.com/plugins/deploy/submission
- MCP review requirements: https://developers.openai.com/plugins/deploy/app-review
- Plugin guidelines: https://developers.openai.com/plugins/plugin-guidelines
- Package guide: https://developers.openai.com/plugins/build/plugins

## 1. Before you upload

- [ ] **Choose the final MCP origin now.** The MCP server origin (scheme,
  hostname and port) cannot change between versions. A new origin needs a new
  plugin. If you want a custom domain, set it up first, then update the `url`
  in `chatgpt/mcp.json` and the server hostname in `privacy.html`.
  Doc: https://developers.openai.com/plugins/deploy/app-review (section
  "Other changes").
- [ ] **Deploy the MCP server** and test it in ChatGPT developer mode, as
  described in `chatgpt/README.md`. The server must be on a public HTTPS
  domain. Doc: https://developers.openai.com/plugins/deploy/app-review#mcp-server-requirements
- [ ] **Deploy the main site** so the listing URLs work:

  ```sh
  curl -sI https://www.pdfspacer.com/privacy | head -1
  curl -sI https://www.pdfspacer.com/terms | head -1
  ```

  Both must return `200`. Doc: https://developers.openai.com/plugins/deploy/submission
  (section "Check metadata": public URLs must be accessible).
- [ ] **Confirm the privacy policy matches the server.** `privacy.html` says
  the server does not use or store the file name, the file reference or the
  `_meta` metadata that ChatGPT attaches to tool calls. Check that
  `chatgpt/api/mcp.js` does not log tool arguments or `_meta`. Replace "between
  1 hour and 30 days" with the exact log retention of your Vercel plan.
  Doc: https://developers.openai.com/plugins/plugin-guidelines (section
  "Privacy policy").
- [ ] **Match the publisher on the legal pages.** Public URLs must identify the
  same publisher as the submission. If you verify as an individual, add your
  verified name to `privacy.html` and `terms.html`, for example "PDFSpacer is
  run by <name>". Doc: https://developers.openai.com/plugins/deploy/submission
  (section "Check metadata").
- [ ] **Complete identity verification** in
  https://platform.openai.com/settings/organization/general. Use individual
  verification to publish under your name, or business verification to publish
  under a business name. Publishing under an unverified name is rejected.
  Doc: https://developers.openai.com/plugins/deploy/app-review (section
  "Organization verification").
- [ ] **Check access.** You need to be an organization owner or have Apps
  Management Write (`api.apps.write`). Use a project with global data
  residency: projects with EU data residency cannot submit MCP plugins.
  Doc: https://developers.openai.com/plugins/deploy/app-review (sections
  "Plugin submission permissions" and "Start the review process").

## 2. Build and upload the ZIP

- [ ] Check that the embedded test cases match the readable copy:

  ```sh
  cd chatgpt
  diff <(jq -S '.extensions["com.openai"].review.test_cases' plugin.json) \
       <(jq -S . review/test-cases.json) && echo "test cases in sync"
  ```

- [ ] Build the ZIP with only the package files. Leave out the server code and
  this `review/` folder:

  ```sh
  cd chatgpt
  rm -f /tmp/pdfspacer-plugin-0.1.0.zip
  zip -r -X /tmp/pdfspacer-plugin-0.1.0.zip plugin.json mcp.json skills assets -x '*.DS_Store'
  unzip -l /tmp/pdfspacer-plugin-0.1.0.zip
  ```

- [ ] Open https://platform.openai.com/plugins, select **Upload new or existing
  plugin**, choose your verified developer identity and upload the ZIP.
  Doc: https://developers.openai.com/plugins/deploy/submission (section
  "Create the draft").
- [ ] Open **Metadata & Skills**, wait for the checks and fix any **Issues**.
  If the category "Education & Research" is rejected, use "Productivity".
  Doc: https://developers.openai.com/plugins/deploy/submission (sections
  "Check metadata" and "Check skills").

## 3. Connect the MCP server

- [ ] Open **MCPs**, select `pdfspacer` and select **Connect**. Check that the
  URL matches `chatgpt/mcp.json` and that authentication is none.
  Doc: https://developers.openai.com/plugins/deploy/submission#mcp
- [ ] **Domain verification.** Copy the challenge token from the portal and
  serve it as plain text, with nothing else in the file:

  ```sh
  printf '%s' 'TOKEN_FROM_PORTAL' > chatgpt/.well-known/openai-apps-challenge
  # deploy the plugin server, then check:
  curl -s https://pdfspacer-chatgpt.vercel.app/.well-known/openai-apps-challenge
  ```

  The response must be the exact token. Doc:
  https://developers.openai.com/plugins/deploy/submission#domain-verification
- [ ] Wait for the tool scan and open **Issues**. Check the scanned
  annotations: `open_pdf_editor` is read-only, not destructive and not open
  world. `edit_pdf_file` is not read-only, is destructive because Save to
  ChatGPT overwrites the opened file, and is not open world.
  Doc: https://developers.openai.com/plugins/plugin-guidelines#correct-annotation

## 4. Review information

- [ ] **Run all eight test cases** before you submit. Run them in the ChatGPT
  desktop app. Also run positive cases 1, 2, 3 and 5 and all negative cases on
  the web and on mobile. Positive case 4 needs the desktop app, because only
  the desktop app has file viewers. Fix the cases in `review/test-cases.json`
  and `plugin.json` together if the real behavior differs.
  Doc: https://developers.openai.com/plugins/deploy/submission (section
  "Complete review information").
- [ ] **Record a demo video** that shows all eight test cases. Upload it where
  a reviewer can watch it without signing in. Add the link as
  `demo_recording_url` under `extensions.com.openai.review` in `plugin.json`
  and upload a new ZIP, or enter it in **Review information → Review details**.
  Doc: https://developers.openai.com/plugins/deploy/submission (section
  "Configure onboarding, review, and publication").
- [ ] **Reviewer credentials:** none are needed. Say so in **Review details**.
- [ ] **Reviewer notes.** The ZIP cannot contain reviewer instructions, so
  paste these notes into **Review details**:

  > No sign-in is needed. PDFSpacer has no accounts, and the MCP server uses no
  > authentication. Test file: https://www.pdfspacer.com/sample.pdf (a one-page
  > A4 worksheet). `open_pdf_editor` opens the editor on any surface, and the
  > reviewer chooses sample.pdf inside it. `edit_pdf_file` is a file
  > entrypoint for `.pdf` files. It runs when a PDF in a chat is opened with
  > PDFSpacer from the file viewer, which only the ChatGPT desktop app has
  > (test case 4). `edit_pdf_file` is marked destructive because Save to
  > ChatGPT overwrites the opened file. The UI is one self-contained HTML
  > resource. It makes no network requests, and the PDF never reaches our
  > server.

- [ ] **Screenshots (optional).** We have none for the plugin yet. The
  directory no longer shows screenshots, so they are not required. To add
  them, capture these in the desktop app, save them as PNG, JPEG or WebP
  (5 MiB or less, 4096 px or less per side) under `chatgpt/assets/`, and list
  them in `interface.screenshots` in `plugin.json`:
  - [ ] The editor open from the sidebar, showing the Choose PDF panel.
  - [ ] sample.pdf open from a chat, with one ruled space added and the Save
    to ChatGPT button visible.
  - [ ] The Export PDF dialog with Paginated A4 and Single Long Page.
  - [ ] The chat after Save to ChatGPT, showing the replaced file.

  Doc: https://developers.openai.com/plugins/deploy/submission (section
  "Icons and screenshots") and
  https://developers.openai.com/plugins/plugin-guidelines (section "Plugin
  name, description, and prompts").
- [ ] **Release notes** are in `extensions.com.openai.publication.release_notes`.
  Check the imported text in **Review details**.
- [ ] **Countries.** The package does not set `publication.countries`. Check the
  availability setting in the dashboard before you publish.
- [ ] **Listing text.** Do not add "free" or other pricing to the listing. The
  guidelines do not allow pricing or promotions in subtitles and descriptions.
  Doc: https://developers.openai.com/plugins/plugin-guidelines (section
  "Plugin name, description, and prompts").
- [ ] **Support URL.** The listing uses GitHub issues. Filing an issue needs a
  GitHub account. If you want users without one to reach you, publish another
  support page and update `supportURL`.
  Doc: https://developers.openai.com/plugins/plugin-guidelines (section
  "Support contact details").

## 5. Submit and publish

- [ ] Select the draft, choose **Submit for review** and complete the policy
  attestations. Only one review can be active per plugin. Feedback arrives by
  email. To appeal a rejection, reply to that email.
  Doc: https://developers.openai.com/plugins/deploy/submission (section
  "Submit the draft").
- [ ] After approval, open the approved version and select **Publish plugin**.
  Doc: https://developers.openai.com/plugins/deploy/submission (section
  "Publish your approved plugin").
- [ ] Before any press release or public announcement, contact
  press@openai.com. Doc: https://developers.openai.com/plugins/deploy/app-review
  (section "Publication and Distribution FAQs").

## After publishing

- Server and tool changes: deploy, then select **Rescan** under **MCPs**. No new
  ZIP is needed.
- Listing, skill or icon changes: raise `version` in `plugin.json`, build a new
  ZIP and upload it to the existing plugin.

Doc: https://developers.openai.com/plugins/deploy/submission (sections "Update
your published plugin" and "Update to your MCP server").
