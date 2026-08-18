export function legalDocumentToHtml(options: {
  title: string;
  version: string;
  intro: string;
  sections: Array<{ heading: string; body: string }>;
  extraHtml?: string;
}): string {
  const sections = options.sections
    .map(
      (section) =>
        `<h2>${escapeHtml(section.heading)}</h2>\n${paragraphsToHtml(section.body)}`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(options.title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 1.25rem; line-height: 1.55; color: #0f172a; }
    h1 { font-size: 1.6rem; }
    h2 { font-size: 1.15rem; margin-top: 1.75rem; }
    .meta { color: #64748b; font-size: 0.9rem; }
    a { color: #0875d1; }
  </style>
</head>
<body>
  <h1>${escapeHtml(options.title)}</h1>
  <p class="meta">Version ${escapeHtml(options.version)}</p>
  ${paragraphsToHtml(options.intro)}
  ${sections}
  ${options.extraHtml ?? ""}
</body>
</html>
`;
}

function paragraphsToHtml(body: string): string {
  return body
    .split(/\n\n+/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
