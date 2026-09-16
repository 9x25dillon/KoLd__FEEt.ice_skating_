/** Points already awarded by game rules, consumed by presentation once per tick. */
export interface RewardEvent {
  x: number; y: number; points: number;
  kind: "snowflake" | "goal" | "light" | "jump" | "spin";
}
export interface RewardEffect extends RewardEvent { age: number }
export const REWARD_LABELS = { snowflake: "SNOWFLAKE", goal: "GOAL!", light: "LIGHT CAUGHT", jump: "JUMP", spin: "SPIN" } as const;
