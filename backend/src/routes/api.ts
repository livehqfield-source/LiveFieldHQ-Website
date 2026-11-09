import { Router } from "express";
import { robloxRouter } from "./roblox.js";

export const router = Router();

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "livefieldhq-backend",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

router.get("/dashboard", (_req, res) => {
  res.json({
    status: "ok",
    stats: {
      games: 0,
      activePlayers: 0,
      buildsToday: 0,
    },
    message: "Dashboard data will live here.",
  });
});

router.use("/roblox", robloxRouter);
