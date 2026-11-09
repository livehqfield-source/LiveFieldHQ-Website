import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getSystem } from "./templates";
import { createJob, type JobSource } from "./store";

/**
 * Turns a free-form request into a LiveFieldHQ system using a local model.
 *
 * Ollama exposes an OpenAI-compatible endpoint, so the backend can ask it for a
 * manifest plus Luau files, write them into roblox-systems/, and let the normal
 * system installer put them in the place.
 */

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/+$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5-coder:7b";
const SYSTEMS_DIR = join(process.cwd(), "..", "roblox-systems");
const TIMEOUT_MS = 300_000;

export interface GeneratedFile {
  kind: "script" | "instance";
  name: string;
  className: string;
  location: string;
  folder?: string;
  source?: string;
}

export interface GeneratedSystem {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  files: GeneratedFile[];
}

export interface GenerateResult {
  ok: boolean;
  error?: string;
  jobId?: string;
  system?: { id: string; name: string; files: string[] };
}

const SYSTEM_PROMPT = `You are the code generator for LiveFieldHQ, a tool that builds things inside Roblox Studio.

The user describes something they want built. You write a LiveFieldHQ "system": a manifest plus the Luau files that make it work. The system is installed into the user's place automatically.

Respond with exactly two things, in this order, and nothing else:

1. A \`\`\`json block holding the manifest:
{
  "id": "lowercase-id-with-dashes",
  "name": "Human Readable Name",
  "description": "One sentence describing what it does.",
  "keywords": ["a phrase the user might say", "another phrase"],
  "files": [
    { "kind": "script", "name": "ScriptName", "className": "LocalScript", "location": "StarterPlayerScripts", "folder": "LiveFieldHQ_Foo" }
  ]
}

2. One \`\`\`luau block per script file, labeled with the filename:
\`\`\`luau:ScriptName.luau
-- the Luau code
\`\`\`

Rules:
- Luau, not Lua. Use game:GetService("..."), Instance.new, UDim2, Color3, Enum, task.wait.
- Build GUI from a LocalScript so the system is self-contained. Create a ScreenGui and everything inside it.
- Location "StarterPlayerScripts" means StarterPlayer.StarterPlayerScripts. Server logic goes in "ServerScriptService". Shared modules go in "ReplicatedStorage".
- Put files in a folder named LiveFieldHQ_<Something>.
- Do NOT use loadstring, HttpService, or touch Workspace.LiveFieldHQ.
- Keep it to one or two scripts unless the request genuinely needs more.
- Make the GUI look intentional: sized frames, sensible colors, readable text.
- Output only the blocks. No commentary, no explanation.`;

interface CodeBlock {
  info: string;
  code: string;
}

/** Pulls every fenced code block out of a model reply. */
function extractBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const pattern = /```([^\n]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    blocks.push({ info: match[1].trim().toLowerCase(), code: match[2].trim() });
  }
  return blocks;
}

function parseGeneration(content: string): GeneratedSystem {
  const blocks = extractBlocks(content);
  const jsonBlock = blocks.find((b) => b.info.includes("json"));
  if (!jsonBlock) throw new Error("the model did not return a JSON manifest");

  let raw: any;
  try {
    raw = JSON.parse(jsonBlock.code);
  } catch {
    // Tolerate trailing commas, which small models love to add.
    raw = JSON.parse(jsonBlock.code.replace(/,\s*([}\]])/g, "$1"));
  }

  const files: GeneratedFile[] = Array.isArray(raw.files)
    ? raw.files.flatMap((entry: any) => {
        if (!entry || typeof entry.name !== "string" || !entry.name) return [];
        return [
          {
            kind: entry.kind === "instance" ? "instance" : "script",
            name: entry.name,
            className: typeof entry.className === "string" ? entry.className : "Script",
            location:
              typeof entry.location === "string" ? entry.location : "ServerScriptService",
            folder: typeof entry.folder === "string" ? entry.folder : undefined,
          },
        ];
      })
    : [];

  if (files.length === 0) throw new Error("the manifest lists no files");

  const codeBlocks = blocks.filter((b) => b.info.includes("luau") || b.info.includes("lua"));

  for (const file of files) {
    if (file.kind !== "script") continue;
    const expected = `${file.name}.luau`.toLowerCase();
    const labelled = codeBlocks.find((b) => {
      const label = b.info.includes(":") ? b.info.split(":").slice(1).join(":").trim() : "";
      return label.toLowerCase() === expected;
    });
    const unlabelled = codeBlocks.find((b) => !b.info.includes(":"));
    const block = labelled ?? unlabelled;
    if (!block) continue;

    file.source = block.code;
    codeBlocks.splice(codeBlocks.indexOf(block), 1);
  }

  const missing = files.filter((f) => f.kind === "script" && !f.source);
  if (missing.length > 0) {
    throw new Error(`no code returned for ${missing.map((f) => f.name).join(", ")}`);
  }

  return {
    id: typeof raw.id === "string" ? raw.id : "",
    name: typeof raw.name === "string" ? raw.name : "Generated System",
    description: typeof raw.description === "string" ? raw.description : "",
    keywords: Array.isArray(raw.keywords) ? raw.keywords.map(String) : [],
    files,
  };
}

async function generateSystem(userRequest: string): Promise<GeneratedSystem> {
  const res = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userRequest },
      ],
      stream: false,
      options: { temperature: 0.2, num_predict: 4096 },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("Ollama returned an empty reply");

  return parseGeneration(content);
}

/** Writes the generated system into roblox-systems/ and returns its id. */
export function saveGeneratedSystem(gen: GeneratedSystem): string {
  const base =
    gen.id
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "generated";

  let id = base;
  let suffix = 2;
  while (existsSync(join(SYSTEMS_DIR, id))) id = `${base}-${suffix++}`;

  const dir = join(SYSTEMS_DIR, id);
  mkdirSync(dir, { recursive: true });

  for (const file of gen.files) {
    if (file.source) writeFileSync(join(dir, `${file.name}.luau`), file.source, "utf8");
  }

  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify(
      {
        id,
        name: gen.name,
        description: gen.description,
        keywords: gen.keywords,
        files: gen.files.map((file) => ({
          kind: file.kind,
          name: file.name,
          className: file.className,
          location: file.location,
          ...(file.folder ? { folder: file.folder } : {}),
          ...(file.source ? { source: `${file.name}.luau` } : {}),
        })),
      },
      null,
      2,
    ),
    "utf8",
  );

  return id;
}

/**
 * Generates a system from a request, saves it, and queues the install job.
 * Failures are returned rather than thrown so the caller can show them.
 */
export async function generateAndInstall(text: string, source: JobSource = "text"): Promise<GenerateResult> {
  try {
    const generated = await generateSystem(text);
    if (!generated.id) return { ok: false, error: "the model did not give the system an id" };

    const id = saveGeneratedSystem(generated);
    const template = getSystem(id);
    if (!template) return { ok: false, error: "the system was saved but could not be read back" };

    const job = createJob(text, source, {
      type: "system",
      system: template.id,
      name: template.name,
      description: template.description,
      files: template.files,
      label: `System — ${template.name}`,
    });

    return {
      ok: true,
      jobId: job.id,
      system: { id: template.id, name: template.name, files: template.files.map((f) => f.name) },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function llmModel(): string {
  return OLLAMA_MODEL;
}
