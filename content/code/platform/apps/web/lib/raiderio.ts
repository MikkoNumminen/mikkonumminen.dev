import { z } from "zod";
import { ActionError } from "@/lib/actionErrors";

const RaiderIoResponseSchema = z.object({
  name: z.string(),
  class: z.string(),
  active_spec_name: z.string().nullable(),
  active_spec_role: z.string().nullable(),
  race: z.string(),
  region: z.string().optional(),
  realm: z.string().optional(),
  gear: z.object({ item_level_equipped: z.number() }).optional(),
  mythic_plus_scores_by_season: z
    .array(z.object({ scores: z.object({ all: z.number() }) }))
    .default([]),
  thumbnail_url: z.string().nullable(),
  profile_url: z.string(),
});

export interface RaiderIoCharacter {
  name: string;
  realm: string;
  region: string;
  className: string;
  spec: string;
  specRole: string;
  race: string;
  itemLevel: number;
  mythicPlusRating: number;
  thumbnailUrl: string;
  profileUrl: string;
}

export async function fetchRaiderIoCharacter(
  name: string,
  realm: string,
  region: string,
): Promise<RaiderIoCharacter> {
  const url = new URL("https://raider.io/api/v1/characters/profile");
  url.searchParams.set("region", region);
  url.searchParams.set("realm", realm);
  url.searchParams.set("name", name);
  url.searchParams.set("fields", "mythic_plus_scores_by_season:current,gear");

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 60 * 60 * 24, tags: ["raiderio"] },
  });

  if (response.status === 400 || response.status === 404) {
    throw new ActionError(
      "characterNotFound",
      `Character "${name}" not found on ${realm}-${region}. Check the name and realm.`,
    );
  }

  if (!response.ok) {
    throw new ActionError("raiderIoError", `Raider.IO returned status ${response.status}`);
  }

  const json = await response.json();
  const parsed = RaiderIoResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ActionError("raiderIoError", "Unexpected response format from Raider.IO API.");
  }
  const data = parsed.data;

  return {
    name: data.name,
    realm: data.realm ?? realm,
    region: data.region ?? region,
    className: data.class,
    spec: data.active_spec_name ?? "",
    specRole: data.active_spec_role ?? "",
    race: data.race,
    itemLevel: data.gear?.item_level_equipped ?? 0,
    mythicPlusRating: data.mythic_plus_scores_by_season[0]?.scores?.all ?? 0,
    thumbnailUrl: data.thumbnail_url ?? "",
    profileUrl: data.profile_url,
  };
}
