/**
 * Schlanker, prozessweiter Event-Bus.
 * Entkoppelt den Hashcat-Manager von Queue/Distributed-Orchestrierung
 * und vermeidet zirkuläre Imports.
 */
import { EventEmitter } from "events";

export type JobFinishedPayload = {
  jobId: string;
  status: "completed" | "failed" | "stopped";
  recoveredPassword?: string;
};

const globalForEvents = global as unknown as { __forensEvents?: EventEmitter };
export const bus: EventEmitter = globalForEvents.__forensEvents || new EventEmitter();
bus.setMaxListeners(50);
if (process.env.NODE_ENV !== "production") globalForEvents.__forensEvents = bus;

export const EVT_JOB_FINISHED = "job:finished";
