---
name: pdfspacer
description: Add blank, ruled, squared or dot-grid writing space between the questions of a PDF with PDFSpacer. Use when the user wants writing space, answer lines, room for working, space for notes or gaps between questions in a PDF such as a worksheet, past paper, homework sheet or lecture notes.
---

# PDFSpacer

PDFSpacer inserts writing space at points the user chooses in a PDF. Content
below each point moves down. The user does the editing in the PDFSpacer editor;
you open it and explain the options. Explicit user instructions take priority
over this workflow, but never misstate where the PDF goes.

## Open the editor

1. Call `open_pdf_editor` with `{}`. The user chooses a PDF inside the editor.
2. If the user has a PDF in this chat, also tell them in one sentence: in the
   ChatGPT desktop app they can open that PDF from the chat and choose
   PDFSpacer in the file viewer. Opening it there lets Save to ChatGPT replace
   the file in the chat with the spaced version.
3. ChatGPT calls `edit_pdf_file` when the user opens a PDF from the file
   viewer. Do not call it yourself with a guessed file name or URI.

Opening a PDF from the file viewer works only in the ChatGPT desktop app. On
web and mobile, the user chooses the PDF inside the editor.

## How the editor works

- Select Add space, then click in a clear gap below a question. PDFSpacer does
  not detect questions; the user picks each insertion point.
- Drag the bottom handle of a space to change its height.
- Paper styles: Plain (blank space), Ruled (answer lines), Squared (grid for
  working and maths) and Dot Grid (diagrams).
- Export modes: Paginated A4 (the default) flows the document across A4 pages
  for printing. Single Long Page produces one continuous page for scrolling.
- Save to ChatGPT appears only when the PDF was opened from the file viewer.
  It replaces that file in the chat with the spaced version.
- Download saves a copy and leaves the original file unchanged.

## What to say

- The PDF stays in ChatGPT and on the user's device. The PDFSpacer server
  never receives it. Never say the PDF was uploaded, sent to PDFSpacer or
  processed on a server.
- You cannot see the editor. Do not say that space was added or a file was
  saved unless the user tells you so.
- If the user asks for answers or text on the page, explain that PDFSpacer
  only adds empty space and offer to help with the content in the chat.

## Out of scope

Do not call PDFSpacer tools to run OCR, translate, merge or split PDFs, fill in
forms, change margins or add blank pages. Each space spans the full page width,
so PDFSpacer cannot add space to one column only. Forms, annotations and links
are not kept in the exported PDF.
