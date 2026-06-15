import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { Lead, Referral } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");
const REFERRALS_FILE = path.join(DATA_DIR, "referrals.json");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

async function readJson<T>(file: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function writeJson<T>(file: string, data: T[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

// ---- Leads ----------------------------------------------------------------

export async function getLeads(): Promise<Lead[]> {
  const leads = await readJson<Lead>(LEADS_FILE);
  return leads.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addLead(lead: Lead): Promise<Lead> {
  const leads = await readJson<Lead>(LEADS_FILE);
  leads.push(lead);
  await writeJson(LEADS_FILE, leads);
  return lead;
}

export async function updateLead(
  id: string,
  patch: Partial<Lead>,
): Promise<Lead | null> {
  const leads = await readJson<Lead>(LEADS_FILE);
  const i = leads.findIndex((l) => l.id === id);
  if (i < 0) return null;
  leads[i] = { ...leads[i], ...patch, id: leads[i].id };
  await writeJson(LEADS_FILE, leads);
  return leads[i];
}

export async function deleteLead(id: string): Promise<void> {
  const leads = (await readJson<Lead>(LEADS_FILE)).filter((l) => l.id !== id);
  await writeJson(LEADS_FILE, leads);
}

// ---- Referrals ------------------------------------------------------------

export async function getReferrals(): Promise<Referral[]> {
  const refs = await readJson<Referral>(REFERRALS_FILE);
  return refs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addReferral(ref: Referral): Promise<Referral> {
  const refs = await readJson<Referral>(REFERRALS_FILE);
  refs.push(ref);
  await writeJson(REFERRALS_FILE, refs);
  return ref;
}

export async function updateReferral(
  id: string,
  patch: Partial<Referral>,
): Promise<Referral | null> {
  const refs = await readJson<Referral>(REFERRALS_FILE);
  const i = refs.findIndex((r) => r.id === id);
  if (i < 0) return null;
  refs[i] = { ...refs[i], ...patch, id: refs[i].id };
  await writeJson(REFERRALS_FILE, refs);
  return refs[i];
}

// ---- Photo storage --------------------------------------------------------

/** Save uploaded photos for a lead; returns stored-file metadata. */
export async function savePhotos(
  leadId: string,
  files: File[],
): Promise<{ name: string; file: string; size: number; type: string }[]> {
  const saved: { name: string; file: string; size: number; type: string }[] = [];
  if (!files.length) return saved;

  const dir = path.join(UPLOADS_DIR, leadId);
  await fs.mkdir(dir, { recursive: true });

  let i = 0;
  for (const f of files) {
    if (!f || typeof f.arrayBuffer !== "function" || f.size === 0) continue;
    i += 1;
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const safeExt = ext.length > 0 && ext.length <= 5 ? ext : "jpg";
    const stored = `photo-${i}.${safeExt}`;
    const buf = Buffer.from(await f.arrayBuffer());
    await fs.writeFile(path.join(dir, stored), buf);
    saved.push({ name: f.name, file: stored, size: f.size, type: f.type });
  }
  return saved;
}

/** Read a single stored photo (admin-gated). */
export async function readPhoto(
  leadId: string,
  fileName: string,
): Promise<Buffer | null> {
  // Prevent path traversal.
  const safeId = path.basename(leadId);
  const safeName = path.basename(fileName);
  const full = path.join(UPLOADS_DIR, safeId, safeName);
  if (!full.startsWith(UPLOADS_DIR)) return null;
  try {
    return await fs.readFile(full);
  } catch {
    return null;
  }
}
