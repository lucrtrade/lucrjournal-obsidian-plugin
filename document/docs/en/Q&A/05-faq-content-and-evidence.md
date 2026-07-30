---
icon: FileText
title: "Content and evidence"
---

These questions cover how OCR, source imports, Playbooks, and templates handle body content and evidence.

## Incorrect OCR result

**OCR read a price in my image incorrectly.**

Compare the result with the original image in `Review OCR Result`, edit it, and then apply it. OCR only writes the fields you submit.

==OCR does not decide `LONG` or `SHORT`.==

→ [[attachments-chart-ocr]] · [[sync-and-import]]

## Imported body overwrite

**My old News body disappeared after I imported a source.**

`Import source content` replaces the current News body with the remote page.

> [!WARNING] What to do
> If the confirmation says content already exists, cancel and copy handwritten content before importing.

→ [[sync-and-import]]

## Replaced Playbook body

**My handwritten paragraphs and extra headings disappeared after I saved a Playbook.**

`Save Playbook` preserves only valid leading frontmatter. ==It replaces the rest of the body with the current Criteria and Confluence.==

Handwritten paragraphs, extra headings, comments, and code blocks do not survive.

> [!WARNING] What to do
> Preserve handwritten content elsewhere before saving the Playbook.

→ [[playbooks-and-criteria]] · [[local-files-and-markdown]]

## Missing Notes section

**A position created from a template has no `Notes`.**

The template body becomes the new position body. If the template has no `# Notes`, the position may have no default Notes section either.

> [!TIP] What to do
> Keep the `# Notes` heading unless you deliberately need another structure.

→ [[templates]]
