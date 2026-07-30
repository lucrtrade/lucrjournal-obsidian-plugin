---
icon: FileText
title: "Content and evidence"
---

These questions cover how OCR, source imports, Playbooks, and templates handle body content and evidence.

## What if OCR is wrong?

Compare the result with the original image in `Review OCR Result` and edit it before applying. OCR only writes fields you submit, and it does not decide `LONG` or `SHORT`. See [[attachments-chart-ocr]] and [[sync-and-import]].

## Why did my old News body disappear after import?

`Import source content` replaces the current News body with the remote page. If the confirmation says content already exists, cancel and copy handwritten content before importing. See [[sync-and-import]].

## Why did my handwritten Playbook notes disappear?

`Save Playbook` preserves only valid leading frontmatter and replaces the rest with the current Criteria and Confluence. Handwritten paragraphs, extra headings, comments, and code blocks do not survive. See [[playbooks-and-criteria]] and [[local-files-and-markdown]].

## Why does a position created from a template have no Notes?

The template body becomes the new position body. If the template has no `# Notes`, the position may have no default Notes section either. Keep that heading unless you deliberately need another structure. See [[templates]].
