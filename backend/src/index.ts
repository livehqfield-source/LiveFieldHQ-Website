import express from "express";
import cors from "cors";
import { router } from "./routes/api.js";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());

app.use("/api", router);

app.get("/", (_req, res) => {
  res.json({ service: "LiveFieldHQ Backend", status: "ok" });
});

app.listen(PORT, () => {
  console.log(`LiveFieldHQ backend running on http://localhost:${PORT}`);
});
