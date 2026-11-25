/**
 * Season labels for the whole site, written by scripts/project_2027.py on every weekly run.
 * TARGET is the season being projected (2027 during the 2026 season); it rolls forward automatically
 * once the next season's games start, so no year is hard-coded anywhere in the UI.
 */
import season from "@/data/season.json";

export const TARGET: number = season.target;
export const SOURCE: number = season.source;
export const PRIOR: number = season.prior;
/** two-digit form, e.g. 27 */
export const yy = (y: number) => String(y).slice(-2);
export const SITE_NAME = `${TARGET} Redraft Sim`;
