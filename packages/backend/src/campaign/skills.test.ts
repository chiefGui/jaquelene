import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SkillOrigin,
  parseSkillKey,
  parseSkillKindKey,
  parseUpdateSkillInput,
} from "@jaquelene/domain";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { ids } from "#backend/id";
import { createSkills } from "#backend/skill/skills";
import type { SkillKindRegistration } from "#backend/skill/types";
import {
  createNarratorApplication,
  narratorSkillKind,
  narratorSkillRegistration,
  jaqueleneNarratorSkillDefinition,
} from "#backend/narrator/module";
import { createCampaigns } from "./campaigns";
import { createCampaignSkills } from "./skills";
import { createCampaignInstructionRegistry } from "./instructions";

const directories: string[] = [];
const databases: Database[] = [];
function openEnvironment(registrations: readonly SkillKindRegistration[] = []) {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-campaign-skills-"));
  directories.push(directory);
  const database = openDatabase(join(directory, "jaquelene.sqlite"));
  databases.push(database);
  const skills = createSkills(database, [narratorSkillRegistration, ...registrations]);
  const campaigns = createCampaigns(database);
  const campaignSkills = createCampaignSkills(database, skills);
  const instructions = createCampaignInstructionRegistry([
    createNarratorApplication(campaignSkills),
  ]);
  return { database, skills, campaigns, campaignSkills, instructions };
}
function start(campaigns: ReturnType<typeof createCampaigns>, title: string) {
  return campaigns.start({ title, composition: [{ kind: narratorSkillKind.key }] });
}
afterEach(() => {
  for (const database of databases.splice(0)) closeDatabase(database);
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("campaign skills", () => {
  it("does not apply a catalog skill without a campaign application", () => {
    const kind = parseSkillKindKey("text-editing");
    const builtIn = {
      key: parseSkillKey("builtin.text-editing.default"),
      ...parseUpdateSkillInput({ title: "Text editing", prompt: "Tighten the supplied text." }),
    };
    const { campaigns, skills, instructions } = openEnvironment([
      {
        definition: { key: kind, name: "Text editing", description: "Edits supplied text." },
        builtInSkills: [builtIn],
        fallbackSkillKey: builtIn.key,
      },
    ]);
    expect(skills.resolveDefault(kind)).toMatchObject(builtIn);
    const campaign = start(campaigns, "Narration only");
    expect(
      instructions.resolve({ threadId: campaign.threadId, campaign: { id: campaign.id } }),
    ).toEqual([
      {
        sourceKey: jaqueleneNarratorSkillDefinition.key,
        content: jaqueleneNarratorSkillDefinition.prompt,
      },
    ]);
    expect(instructions.resolve({ threadId: ids.thread.create(), campaign: null })).toEqual([]);
  });

  it("restores inheritance when an explicit selection is cleared", () => {
    const { campaigns, campaignSkills, skills } = openEnvironment();
    const campaign = start(campaigns, "Inherited");
    const custom = skills.create({
      kind: narratorSkillKind.key,
      title: "Custom",
      prompt: "Use second person.",
    });
    skills.setDefault(narratorSkillKind.key, custom.key);
    campaignSkills.setSelection({
      campaignId: campaign.id,
      kind: narratorSkillKind.key,
      skillKey: jaqueleneNarratorSkillDefinition.key,
    });
    expect(
      campaignSkills.setSelection({ campaignId: campaign.id, kind: narratorSkillKind.key }),
    ).toEqual({
      campaignId: campaign.id,
      kind: narratorSkillKind.key,
      effectiveSkillKey: custom.key,
      source: "default",
    });
    expect(campaignSkills.resolve(campaign.id, narratorSkillKind.key)).toEqual(custom);
  });

  it("keeps inherited and explicit campaign selections inspectable", () => {
    const { campaigns, campaignSkills, skills } = openEnvironment();
    const inherited = start(campaigns, "Inherited");
    const pinned = start(campaigns, "Pinned");
    const custom = skills.create({
      kind: narratorSkillKind.key,
      title: "Custom",
      prompt: "Use second person.",
    });

    expect(campaignSkills.getSelection(inherited.id, narratorSkillKind.key)).toMatchObject({
      effectiveSkillKey: jaqueleneNarratorSkillDefinition.key,
      source: "fallback",
    });
    skills.setDefault(narratorSkillKind.key, custom.key);
    campaignSkills.setSelection({
      campaignId: pinned.id,
      kind: narratorSkillKind.key,
      skillKey: jaqueleneNarratorSkillDefinition.key,
    });
    expect(campaignSkills.getSelection(inherited.id, narratorSkillKind.key)).toMatchObject({
      effectiveSkillKey: custom.key,
      source: "default",
    });
    expect(campaignSkills.getSelection(pinned.id, narratorSkillKind.key)).toMatchObject({
      selectedSkillKey: jaqueleneNarratorSkillDefinition.key,
      effectiveSkillKey: jaqueleneNarratorSkillDefinition.key,
      source: "campaign",
    });
  });

  it("uses edited prompt content on the next application", () => {
    const { campaigns, instructions, skills } = openEnvironment();
    const custom = skills.create({
      kind: narratorSkillKind.key,
      title: "Mutable",
      prompt: "First prompt.",
    });
    const campaign = campaigns.start({
      title: "Mutable campaign",
      composition: [{ kind: narratorSkillKind.key, skillKey: custom.key }],
    });
    const context = { threadId: campaign.threadId, campaign: { id: campaign.id } };

    expect(instructions.resolve(context)).toEqual([
      { sourceKey: custom.key, content: "First prompt." },
    ]);
    skills.update(custom.key, {
      title: "Mutable",
      prompt: "Second prompt.",
    });
    expect(instructions.resolve(context)).toEqual([
      { sourceKey: custom.key, content: "Second prompt." },
    ]);
  });

  it("falls back cleanly when custom skills are deleted", () => {
    const { campaigns, campaignSkills, skills } = openEnvironment();
    const custom = skills.create({
      kind: narratorSkillKind.key,
      title: "Temporary",
      prompt: "Temporary content.",
    });
    const campaign = campaigns.start({
      title: "Fallback",
      composition: [{ kind: narratorSkillKind.key, skillKey: custom.key }],
    });
    skills.setDefault(narratorSkillKind.key, custom.key);

    expect(skills.delete(custom.key)).toEqual({
      kind: narratorSkillKind.key,
    });
    expect(skills.getDefault(narratorSkillKind.key)).toEqual({
      kind: narratorSkillKind.key,
      skillKey: jaqueleneNarratorSkillDefinition.key,
      source: "fallback",
    });
    expect(campaignSkills.getSelection(campaign.id, narratorSkillKind.key)).toMatchObject({
      effectiveSkillKey: jaqueleneNarratorSkillDefinition.key,
      source: "fallback",
    });
  });

  it("rejects unavailable kinds, cross-kind skills, and unknown campaigns", () => {
    const { campaigns, campaignSkills, database } = openEnvironment();
    const campaign = start(campaigns, "Validation");
    database.$client
      .prepare("INSERT INTO skill_kinds (key, name, description) VALUES (?, ?, ?)")
      .run("setting", "Setting", "Defines the story world.");
    database.$client
      .prepare("INSERT INTO skills (key, kind, origin, title, prompt) VALUES (?, ?, ?, ?, ?)")
      .run("builtin.setting.empty", "setting", SkillOrigin.BuiltIn, "Empty", "No setting.");

    expect(() =>
      campaignSkills.setSelection({
        campaignId: campaign.id,
        kind: narratorSkillKind.key,
        skillKey: parseSkillKey("builtin.setting.empty"),
      }),
    ).toThrow(RangeError);
    expect(campaignSkills.getSelection(ids.campaign.create(), narratorSkillKind.key)).toBeNull();
    expect(
      campaignSkills.setSelection({
        campaignId: ids.campaign.create(),
        kind: narratorSkillKind.key,
      }),
    ).toBeNull();
    expect(campaignSkills.resolve(ids.campaign.create(), narratorSkillKind.key)).toBeNull();
    expect(() => campaignSkills.getSelection(campaign.id, parseSkillKindKey("setting"))).toThrow(
      RangeError,
    );
    expect(() =>
      campaignSkills.setSelection({
        campaignId: campaign.id,
        kind: narratorSkillKind.key,
        skillKey: parseSkillKey("missing"),
      }),
    ).toThrow(RangeError);
  });
});
