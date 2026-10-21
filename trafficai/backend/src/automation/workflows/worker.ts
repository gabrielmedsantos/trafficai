import {syncLifecycleEvents} from './lifecycle';
import { pollWhatsAppStatuses } from "./status-poll";
import { reconcileReceipts } from "./receipts";
import { campaignTick } from "./campaigns";
import { dispatchEvents } from "./events";
import { claimJob, executeJob } from "./engine";
import { query } from "../../database/connection";
import { logger } from "../../shared/logger";
let lastLifecycleSync=0;
export async function workflowTick() {
  if(Date.now()-lastLifecycleSync>=60000){lastLifecycleSync=Date.now();await syncLifecycleEvents();}
  await reconcileReceipts();
  await dispatchEvents();
  await campaignTick();
  for (let i = 0; i < 20; i++) {
    const job = await claimJob();
    if (!job) break;
    await executeJob(job);
  }
}
export function startWorkflowWorker() {
  if (process.env.AUTOMATION_WORKFLOWS_ENABLED !== "true") return;
  let stopped = false,
    polling = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const [r] = await query(
        "SELECT CASE WHEN to_regclass('public.aw_external_intents') IS NOT NULL THEN to_regclass('public.aw_enrollments') END AS installed",
      );
      if (!r.installed) {
        logger.warn("Automations: migration pending; worker stopped");
        stopped = true;
        return;
      }
      await workflowTick();
      if (!polling) {
        polling = true;
        void pollWhatsAppStatuses()
          .catch(() => logger.warn("Automations: receipt lookup unavailable"))
          .finally(() => {
            polling = false;
          });
      }
    } catch {
      logger.error("Automations: worker cycle failed");
    }
    if (!stopped) setTimeout(tick, 5000).unref();
  };
  void tick();
}
