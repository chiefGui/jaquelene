import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePromptKey, parsePromptKindKey, parseUpdatePromptInput } from "@jaquelene/domain";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createCampaigns } from "#backend/campaign/campaigns";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { ids } from "#backend/id";
import type { PromptKindModule } from "./module";
import { promptPageSize } from "./prompts";
import { createPromptSubsystem } from "./subsystem";

const testPromptKind = Object.freeze({
  key: parsePromptKindKey("test"),
  name: "Test",
  description: "Exercises generic prompt behavior.",
});
const testFactoryPrompt = Object.freeze({
  key: parsePromptKey("factory.test.default"),
  kind: testPromptKind.key,
  origin: "factory",
  ...parseUpdatePromptInput({
    title: "Default",
    body: "Default prompt content.",
  }),
  createdAt: 0,
});
const testPromptModule = Object.freeze({
  definition: testPromptKind,
  factoryPrompts: Object.freeze([testFactoryPrompt]),
  fallbackPromptKey: testFactoryPrompt.key,
  createApplication(prompts) {
    return {
      apply({ campaign }) {
        if (!campaign) {
          return [];
        }

        const prompt = prompts.resolveCampaignPrompt(campaign.id, testPromptKind.key);

        if (!prompt) {
          throw new Error(`Campaign "${campaign.id}" has no test prompt.`);
        }

        return [{ key: prompt.key, content: prompt.body }];
      },
    };
  },
}) satisfies PromptKindModule;

const directories: string[] = [];
const databases: Database[] = [];

function createDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-prompts-"));
  directories.push(directory);
  return join(directory, "jaquelene.sqlite");
}

function openEnvironment(path = createDatabasePath(), now?: () => number) {
  const database = openDatabase(path);
  databases.push(database);
  const { applications: promptApplications, prompts } = createPromptSubsystem(
    database,
    [testPromptModule],
    now,
  );
  const campaigns = createCampaigns(database, now);
  return { campaigns, database, promptApplications, prompts };
}

function start(campaigns: ReturnType<typeof createCampaigns>, title: string) {
  return campaigns.start({ title, composition: [{ kind: testPromptKind.key }] });
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    closeDatabase(database);
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("prompts", () => {
  it("keeps registered prompt kinds authoritative and ordered", () => {
    const database = openDatabase(createDatabasePath());
    databases.push(database);
    const setting = {
      definition: {
        key: parsePromptKindKey("setting"),
        name: "Setting",
        description: "Defines the world in which the campaign takes place.",
      },
      factoryPrompts: [],
      createApplication: () => ({ apply: () => [] }),
    } satisfies PromptKindModule;
    const { prompts } = createPromptSubsystem(database, [setting, testPromptModule]);

    expect(prompts.listKinds()).toEqual([setting.definition, testPromptKind]);
    expect(() => prompts.list({ kind: parsePromptKindKey("unregistered") })).toThrow(
      'Prompt kind "unregistered" does not exist.',
    );
  });

  it("installs and repairs a built-in prompt catalog", () => {
    const path = createDatabasePath();
    const first = openEnvironment(path);

    expect(first.prompts.listKinds()).toEqual([testPromptKind]);
    expect(first.prompts.list({ kind: testPromptKind.key }).prompts).toEqual([testFactoryPrompt]);
    expect(
      first.prompts.update(testFactoryPrompt.key, {
        title: "Changed",
        body: "Changed.",
      }),
    ).toBeNull();
    expect(first.prompts.delete(testFactoryPrompt.key)).toBeNull();
    const obsoleteFactoryPromptKey = parsePromptKey("factory.test.obsolete");
    first.database.$client
      .prepare("UPDATE prompts SET body = 'Corrupted' WHERE key = ?")
      .run(testFactoryPrompt.key);
    first.database.$client
      .prepare(
        "INSERT INTO prompts (key, kind, origin, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(obsoleteFactoryPromptKey, testPromptKind.key, "factory", "Obsolete", "Remove me.", 0);
    closeDatabase(first.database);

    const reopened = openEnvironment(path);
    expect(reopened.prompts.get(testFactoryPrompt.key)).toEqual(testFactoryPrompt);
    expect(reopened.prompts.get(obsoleteFactoryPromptKey)).toBeNull();
  });

  it("creates, updates, persists, and pages custom prompts", () => {
    let createdAt = 1;
    const path = createDatabasePath();
    const first = openEnvironment(path, () => createdAt++);
    const created = Array.from({ length: promptPageSize }, (_, index) =>
      first.prompts.create({
        kind: testPromptKind.key,
        title: `Prompt ${index}`,
        body: `Prompt content ${index}.`,
      }),
    );
    const firstPage = first.prompts.list({ kind: testPromptKind.key });

    expect(firstPage.prompts).toHaveLength(promptPageSize);
    expect(firstPage.prompts[0]).toEqual(testFactoryPrompt);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    first.prompts.delete(created[created.length - 2]!.key);
    expect(
      first.prompts.list({ kind: testPromptKind.key, cursor: firstPage.nextCursor! }).prompts,
    ).toEqual([created.at(-1)]);
    const updated = first.prompts.update(created[0]!.key, {
      title: "  Observer  ",
      body: "Describe only observable facts.",
    });
    closeDatabase(first.database);

    expect(openEnvironment(path).prompts.get(created[0]!.key)).toEqual(updated);
  });

  it("keeps inherited and explicit campaign selections inspectable", () => {
    const { campaigns, prompts } = openEnvironment();
    const inherited = start(campaigns, "Inherited");
    const pinned = start(campaigns, "Pinned");
    const custom = prompts.create({
      kind: testPromptKind.key,
      title: "Custom",
      body: "Use second person.",
    });

    expect(prompts.getCampaignSelection(inherited.id, testPromptKind.key)).toMatchObject({
      effectivePromptKey: testFactoryPrompt.key,
      source: "fallback",
    });
    prompts.setDefault(testPromptKind.key, custom.key);
    prompts.setCampaignSelection({
      campaignId: pinned.id,
      kind: testPromptKind.key,
      promptKey: testFactoryPrompt.key,
    });
    expect(prompts.getCampaignSelection(inherited.id, testPromptKind.key)).toMatchObject({
      effectivePromptKey: custom.key,
      source: "default",
    });
    expect(prompts.getCampaignSelection(pinned.id, testPromptKind.key)).toMatchObject({
      selectedPromptKey: testFactoryPrompt.key,
      effectivePromptKey: testFactoryPrompt.key,
      source: "campaign",
    });
  });

  it("restores the registered fallback when the default override is cleared", () => {
    const { prompts } = openEnvironment();
    const custom = prompts.create({
      kind: testPromptKind.key,
      title: "Custom",
      body: "Use second person.",
    });

    prompts.setDefault(testPromptKind.key, custom.key);

    expect(prompts.setDefault(testPromptKind.key)).toEqual({
      kind: testPromptKind.key,
      promptKey: testFactoryPrompt.key,
      source: "fallback",
    });
  });

  it("uses edited prompt content on the next application", () => {
    const { campaigns, promptApplications, prompts } = openEnvironment();
    const custom = prompts.create({
      kind: testPromptKind.key,
      title: "Mutable",
      body: "First body.",
    });
    const campaign = campaigns.start({
      title: "Mutable campaign",
      composition: [{ kind: testPromptKind.key, promptKey: custom.key }],
    });
    const context = { threadId: campaign.threadId, campaign: { id: campaign.id } };

    expect(promptApplications.resolve(context)).toEqual([
      { sourceKey: custom.key, content: "First body." },
    ]);
    prompts.update(custom.key, {
      title: "Mutable",
      body: "Second body.",
    });
    expect(promptApplications.resolve(context)).toEqual([
      { sourceKey: custom.key, content: "Second body." },
    ]);
  });

  it("falls back cleanly when custom prompts are deleted", () => {
    const { campaigns, prompts } = openEnvironment();
    const custom = prompts.create({
      kind: testPromptKind.key,
      title: "Temporary",
      body: "Temporary content.",
    });
    const campaign = campaigns.start({
      title: "Fallback",
      composition: [{ kind: testPromptKind.key, promptKey: custom.key }],
    });
    prompts.setDefault(testPromptKind.key, custom.key);

    expect(prompts.delete(custom.key)).toEqual({
      kind: testPromptKind.key,
    });
    expect(prompts.getDefault(testPromptKind.key)).toEqual({
      kind: testPromptKind.key,
      promptKey: testFactoryPrompt.key,
      source: "fallback",
    });
    expect(prompts.getCampaignSelection(campaign.id, testPromptKind.key)).toMatchObject({
      effectivePromptKey: testFactoryPrompt.key,
      source: "fallback",
    });
  });

  it("rejects unavailable kinds, cross-kind prompts, and unknown campaigns", () => {
    const { campaigns, database, prompts } = openEnvironment();
    const campaign = start(campaigns, "Validation");
    database.$client
      .prepare("INSERT INTO prompt_kinds (key, name, description) VALUES (?, ?, ?)")
      .run("setting", "Setting", "Defines the story world.");
    database.$client
      .prepare(
        "INSERT INTO prompts (key, kind, origin, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("factory.setting.empty", "setting", "factory", "Empty", "No setting.", 0);

    expect(() =>
      prompts.setCampaignSelection({
        campaignId: campaign.id,
        kind: testPromptKind.key,
        promptKey: parsePromptKey("factory.setting.empty"),
      }),
    ).toThrow(RangeError);
    expect(prompts.getCampaignSelection(ids.campaign.create(), testPromptKind.key)).toBeNull();
  });
});
